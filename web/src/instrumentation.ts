export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") {
    console.log("[instrumentation] edge runtime boot");
    return;
  }

  try {
    const { logEnvValidation } = await import("@/lib/env");
    logEnvValidation("instrumentation");
  } catch (err) {
    console.error(
      "[instrumentation] env validation failed",
      err instanceof Error ? err.message : err,
    );
  }
}
