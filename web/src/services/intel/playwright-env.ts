import "server-only";

/**
 * Chromium/Playwright cannot run inside Netlify/Lambda serverless bundles
 * (`/var/task` has no browser binaries / incomplete playwright-core).
 */
export function canUsePlaywright(): boolean {
  if (process.env.DISABLE_PLAYWRIGHT === "1") return false;
  if (process.env.FORCE_PLAYWRIGHT === "1") return true;
  if (process.env.NETLIFY === "true") return false;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return false;
  if (process.env.VERCEL) return false;
  if (process.cwd().startsWith("/var/task")) return false;
  return true;
}
