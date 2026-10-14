import "server-only";

import { Resend } from "resend";
import { logger } from "@/lib/logger";

export function canSendOutreachEmail() {
  return Boolean(process.env.RESEND_API_KEY?.trim());
}

/**
 * Parse "Name <email@domain>" or bare email into Resend `from` string.
 */
function resolveFromHeader(fromName: string): string {
  const raw =
    process.env.OUTREACH_FROM_EMAIL?.trim() ||
    "Insight Collabs <onboarding@resend.dev>";
  if (raw.includes("<") && raw.includes(">")) return raw;
  if (raw.includes("@")) return `${fromName} Collabs <${raw}>`;
  return `Insight Collabs <onboarding@resend.dev>`;
}

export async function sendOutreachEmail(opts: {
  fromName: string;
  to: string;
  subject: string;
  text: string;
}): Promise<{ id?: string; ok: boolean; error?: string }> {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) {
    return {
      ok: false,
      error: "Missing RESEND_API_KEY in environment",
    };
  }

  const from = resolveFromHeader(opts.fromName || "Insight");
  const replyTo = process.env.OUTREACH_REPLY_TO?.trim() || undefined;
  const resend = new Resend(key);

  try {
    const result = await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      ...(replyTo ? { replyTo } : {}),
    });
    if (result.error) {
      logger.warn("api", "Resend send error", { error: result.error });
      return { ok: false, error: result.error.message };
    }
    return { ok: true, id: result.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("api", "Resend send failed", { message });
    return { ok: false, error: message };
  }
}
