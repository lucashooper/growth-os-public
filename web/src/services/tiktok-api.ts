import "server-only";
import { logger } from "@/lib/logger";

/** First 10 chars only — never log or return the full access token. */
export function maskAccessToken(token: string | null | undefined): string {
  if (!token) return "(missing)";
  return token.length <= 10 ? `${token}…` : `${token.slice(0, 10)}…`;
}

export type TikTokOAuthUserInfo = {
  open_id?: string;
  union_id?: string;
  avatar_url?: string;
  display_name?: string;
  username?: string;
};

export type TikTokCallDiagnostics = {
  step: string;
  method: string;
  endpointUrl: string;
  requestPayload: unknown;
  accessTokenPrefix: string;
  oauthUserInfo: TikTokOAuthUserInfo | null;
  httpStatus: number | null;
  responseHeaders: Record<string, string>;
  rawResponseBody: string;
  parsedJson: unknown;
  /** TikTok `error.code` (e.g. ok, access_token_invalid) */
  error_code: string | null;
  /** TikTok `error.message` */
  error_message: string | null;
  /** TikTok `error.log_id` */
  log_id: string | null;
  /** Our correlation id for this outbound call */
  request_id: string;
};

function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function extractTikTokError(parsed: unknown): {
  error_code: string | null;
  error_message: string | null;
  log_id: string | null;
} {
  if (!parsed || typeof parsed !== "object") {
    return { error_code: null, error_message: null, log_id: null };
  }
  const root = parsed as Record<string, unknown>;
  const err = root.error;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown>;
    return {
      error_code: typeof e.code === "string" ? e.code : e.code != null ? String(e.code) : null,
      error_message:
        typeof e.message === "string"
          ? e.message
          : e.message != null
            ? String(e.message)
            : null,
      log_id: typeof e.log_id === "string" ? e.log_id : null,
    };
  }
  // Some OAuth endpoints use flat error / error_description
  return {
    error_code: typeof root.error === "string" ? root.error : null,
    error_message:
      typeof root.error_description === "string"
        ? root.error_description
        : typeof root.message === "string"
          ? root.message
          : null,
    log_id: typeof root.log_id === "string" ? root.log_id : null,
  };
}

export class TikTokApiError extends Error {
  readonly status: number;
  readonly diagnostics: TikTokCallDiagnostics;

  constructor(message: string, diagnostics: TikTokCallDiagnostics, httpStatus?: number) {
    super(message);
    this.name = "TikTokApiError";
    this.diagnostics = diagnostics;
    this.status =
      httpStatus && httpStatus >= 400
        ? httpStatus
        : diagnostics.httpStatus && diagnostics.httpStatus >= 400
          ? diagnostics.httpStatus
          : 502;
  }

  /** Safe JSON for API clients — never includes full tokens or client secret. */
  toJSON(): Record<string, unknown> {
    const d = this.diagnostics;
    return {
      error: this.message,
      code: "TIKTOK_API",
      error_code: d.error_code,
      error_message: d.error_message,
      log_id: d.log_id,
      request_id: d.request_id,
      tiktok: {
        step: d.step,
        method: d.method,
        endpointUrl: d.endpointUrl,
        requestPayload: d.requestPayload,
        accessTokenPrefix: d.accessTokenPrefix,
        oauthUserInfo: d.oauthUserInfo,
        httpStatus: d.httpStatus,
        responseHeaders: d.responseHeaders,
        rawResponseBody: d.rawResponseBody,
        parsedJson: d.parsedJson,
        error_code: d.error_code,
        error_message: d.error_message,
        log_id: d.log_id,
        request_id: d.request_id,
      },
    };
  }
}

export function isTikTokApiError(err: unknown): err is TikTokApiError {
  return err instanceof TikTokApiError;
}

/**
 * Build NextResponse body for a TikTok failure.
 * Always returns the full diagnostic dump (token/secret redacted) so we can
 * distinguish payload validation, media pull, permissions, and sandbox limits
 * instead of collapsing to a generic "Please review our integration guidelines".
 * Set TIKTOK_DEBUG_ERRORS=0 to return only summary fields.
 */
export function tiktokErrorResponseBody(err: TikTokApiError): Record<string, unknown> {
  const d = err.diagnostics;
  const summary: Record<string, unknown> = {
    ok: false,
    error: err.message,
    code: "TIKTOK_API",
    error_code: d.error_code,
    error_message: d.error_message ?? err.message,
    log_id: d.log_id,
    request_id: d.request_id,
    step: d.step,
    endpointUrl: d.endpointUrl,
    httpStatus: d.httpStatus,
    accessTokenPrefix: d.accessTokenPrefix,
    oauthUserInfo: d.oauthUserInfo,
  };

  const redact =
    process.env.TIKTOK_DEBUG_ERRORS === "0" ||
    process.env.TIKTOK_DEBUG_ERRORS === "false";
  if (redact) return summary;

  return { ...summary, ...err.toJSON() };
}

export type TikTokFetchOptions = {
  step: string;
  method?: string;
  url: string;
  accessToken: string;
  /** JSON body (will be stringified) or already-string body */
  body?: unknown;
  headers?: Record<string, string>;
  oauthUserInfo?: TikTokOAuthUserInfo | null;
  signal?: AbortSignal;
  /** If true, treat missing publish_id / non-ok error.code as failure even when HTTP 200 */
  requireOkCode?: boolean;
};

export type TikTokFetchResult<T = unknown> = {
  ok: boolean;
  httpStatus: number;
  rawBody: string;
  parsed: T;
  headers: Record<string, string>;
  diagnostics: TikTokCallDiagnostics;
};

/**
 * Outbound TikTok Open API call with full diagnostics logging.
 * Throws TikTokApiError when HTTP fails or (if requireOkCode) error.code !== "ok".
 */
export async function tiktokFetchJson<T = unknown>(
  opts: TikTokFetchOptions,
): Promise<TikTokFetchResult<T>> {
  const method = (opts.method || "POST").toUpperCase();
  const request_id = `tt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const accessTokenPrefix = maskAccessToken(opts.accessToken);
  const oauthUserInfo = opts.oauthUserInfo ?? null;

  let requestPayload: unknown = opts.body ?? null;
  let bodyInit: string | undefined;
  if (opts.body !== undefined && opts.body !== null) {
    if (typeof opts.body === "string") {
      bodyInit = opts.body;
      try {
        requestPayload = JSON.parse(opts.body);
      } catch {
        requestPayload = opts.body;
      }
    } else {
      requestPayload = opts.body;
      bodyInit = JSON.stringify(opts.body);
    }
  }

  logger.info("api", `TikTok ${opts.step}:request`, {
    request_id,
    method,
    endpointUrl: opts.url,
    accessTokenPrefix,
    oauthUserInfo,
    requestPayload,
  });

  let res: Response;
  try {
    res = await fetch(opts.url, {
      method,
      headers: {
        Authorization: `Bearer ${opts.accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        ...(opts.headers || {}),
      },
      body: method === "GET" || method === "HEAD" ? undefined : bodyInit,
      signal: opts.signal,
    });
  } catch (err) {
    const aborted =
      err instanceof Error &&
      (err.name === "AbortError" || /aborted/i.test(err.message));
    const message = aborted
      ? `TikTok ${opts.step} timed out / aborted`
      : err instanceof Error
        ? err.message
        : "TikTok network error";
    const diagnostics: TikTokCallDiagnostics = {
      step: opts.step,
      method,
      endpointUrl: opts.url,
      requestPayload,
      accessTokenPrefix,
      oauthUserInfo,
      httpStatus: null,
      responseHeaders: {},
      rawResponseBody: "",
      parsedJson: null,
      error_code: aborted ? "network_timeout" : "network_error",
      error_message: message,
      log_id: null,
      request_id,
    };
    logger.error("api", `TikTok ${opts.step}:network`, diagnostics);
    throw new TikTokApiError(message, diagnostics, 504);
  }

  const responseHeaders = headersToObject(res.headers);
  const rawResponseBody = await res.text();
  let parsedJson: unknown = null;
  try {
    parsedJson = rawResponseBody ? JSON.parse(rawResponseBody) : null;
  } catch {
    parsedJson = null;
  }

  const extracted = extractTikTokError(parsedJson);
  const diagnostics: TikTokCallDiagnostics = {
    step: opts.step,
    method,
    endpointUrl: opts.url,
    requestPayload,
    accessTokenPrefix,
    oauthUserInfo,
    httpStatus: res.status,
    responseHeaders,
    rawResponseBody: rawResponseBody.slice(0, 50_000),
    parsedJson,
    error_code: extracted.error_code,
    error_message: extracted.error_message,
    log_id: extracted.log_id,
    request_id,
  };

  logger.info("api", `TikTok ${opts.step}:response`, {
    request_id,
    method,
    endpointUrl: opts.url,
    accessTokenPrefix,
    oauthUserInfo,
    httpStatus: res.status,
    responseHeaders,
    rawResponseBody: diagnostics.rawResponseBody,
    parsedJson,
    error_code: extracted.error_code,
    error_message: extracted.error_message,
    log_id: extracted.log_id,
    requestPayload,
  });

  const requireOk = opts.requireOkCode !== false;
  const codeOk = !extracted.error_code || extracted.error_code === "ok";
  const httpOk = res.ok;

  if (!httpOk || (requireOk && !codeOk)) {
    const message =
      extracted.error_message ||
      extracted.error_code ||
      `TikTok ${opts.step} failed (HTTP ${res.status})`;
    logger.error("api", `TikTok ${opts.step}:failed`, {
      request_id,
      error_code: extracted.error_code,
      error_message: extracted.error_message,
      log_id: extracted.log_id,
      httpStatus: res.status,
      rawResponseBody: diagnostics.rawResponseBody,
      parsedJson,
      requestPayload,
    });
    throw new TikTokApiError(message, diagnostics, res.status >= 400 ? res.status : 502);
  }

  return {
    ok: true,
    httpStatus: res.status,
    rawBody: rawResponseBody,
    parsed: parsedJson as T,
    headers: responseHeaders,
    diagnostics,
  };
}
