/**
 * Public site identity. Values come from the environment so a self-hosted
 * copy does not inherit another operator's domain or inbox.
 * Existing names (APP_BASE_URL, NEXT_PUBLIC_APP_BASE_URL) stay compatible
 * with the current deployment.
 */

export function configuredSiteUrl(): string {
  const raw =
    (typeof window !== "undefined"
      ? process.env.NEXT_PUBLIC_APP_BASE_URL
      : process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL) ||
    "";
  return raw.trim().replace(/\/$/, "");
}

/** Origin used for metadata, auth redirects, and legal pages. */
export function publicSiteUrl(fallback = "http://localhost:3000"): string {
  return configuredSiteUrl() || fallback;
}

/**
 * Inbox shown on Contact, Privacy, and Terms.
 * NEXT_PUBLIC_ so marketing pages can render it. CONTACT_EMAIL is a
 * server-side alias for the same address.
 */
export function contactEmail(): string {
  return (
    process.env.NEXT_PUBLIC_CONTACT_EMAIL ||
    process.env.CONTACT_EMAIL ||
    ""
  ).trim();
}
