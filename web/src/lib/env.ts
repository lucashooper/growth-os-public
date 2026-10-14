export type EnvCheck = {
  key: string;
  required: boolean;
  present: boolean;
  /** Safe hint only — never the value */
  hint?: string;
};

const REQUIRED_PROD = [
  "DATABASE_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
] as const;

const OPTIONAL = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "OWNER_EMAIL",
  "APP_BASE_URL",
  "NEXT_PUBLIC_APP_BASE_URL",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "AI_PROVIDER",
  "TIKTOK_CLIENT_KEY",
  "TIKTOK_CLIENT_SECRET",
  "AUTH_DEV_BYPASS",
] as const;

function present(key: string): boolean {
  const v = process.env[key];
  return typeof v === "string" && v.trim().length > 0;
}

function hintFor(key: string): string | undefined {
  const v = process.env[key];
  if (!v) return undefined;
  if (key === "DATABASE_URL") {
    if (/^postgres(ql)?:\/\//i.test(v)) return "postgresql";
    if (v.startsWith("file:")) return "sqlite";
    return "set";
  }
  if (key.includes("URL")) {
    try {
      return new URL(v).host;
    } catch {
      return "invalid-url-shape";
    }
  }
  if (key.endsWith("_KEY") || key.includes("SECRET") || key.includes("PASSWORD")) {
    return `len:${v.length}`;
  }
  return "set";
}

/** Presence-only env report — never includes secret values. */
export function getEnvReport(): {
  environment: string;
  nodeEnv: string;
  netlify: boolean;
  checks: EnvCheck[];
  ok: boolean;
  missingRequired: string[];
} {
  const environment =
    process.env.CONTEXT ||
    process.env.NETLIFY_CONTEXT ||
    (process.env.NETLIFY === "true" ? "netlify" : "local");

  const checks: EnvCheck[] = [
    ...REQUIRED_PROD.map((key) => ({
      key,
      required: true,
      present: present(key),
      hint: hintFor(key),
    })),
    ...OPTIONAL.map((key) => ({
      key,
      required: false,
      present: present(key),
      hint: hintFor(key),
    })),
  ];

  const missingRequired = checks
    .filter((c) => c.required && !c.present)
    .map((c) => c.key);

  return {
    environment,
    nodeEnv: process.env.NODE_ENV || "undefined",
    netlify: process.env.NETLIFY === "true",
    checks,
    ok: missingRequired.length === 0 || process.env.NODE_ENV !== "production",
    missingRequired,
  };
}

let validatedOnce = false;

/** Log env validation once per cold start (no secrets). */
export function logEnvValidation(tag = "startup") {
  if (validatedOnce) return getEnvReport();
  validatedOnce = true;
  const report = getEnvReport();
  const summary = report.checks.map(
    (c) => `${c.key}=${c.present ? "yes" : "NO"}${c.hint ? `(${c.hint})` : ""}`,
  );
  const level = report.missingRequired.length ? "error" : "info";
  const line = `[env] [${tag}] node=${process.version} netlify=${report.netlify} ctx=${report.environment} ${summary.join(" ")}`;
  if (level === "error") {
    console.error(line);
    console.error(
      `[env] missing required: ${report.missingRequired.join(", ")}`,
    );
  } else {
    console.log(line);
  }
  return report;
}
