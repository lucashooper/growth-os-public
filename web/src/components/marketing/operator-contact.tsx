import { contactEmail, configuredSiteUrl } from "@/lib/public-config";

export function OperatorEmail() {
  const email = contactEmail();
  if (!email) {
    return <span>the address in NEXT_PUBLIC_CONTACT_EMAIL</span>;
  }
  return <a href={`mailto:${email}`}>{email}</a>;
}

export function OperatorSite({ strong = false }: { strong?: boolean }) {
  const site = configuredSiteUrl();
  const node = site ? (
    <a href={site}>{site}</a>
  ) : (
    <span>the address in APP_BASE_URL</span>
  );
  return strong ? <strong>{node}</strong> : node;
}
