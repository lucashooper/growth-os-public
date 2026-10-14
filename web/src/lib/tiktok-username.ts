/** Normalize TikTok handles for storage + matching (strips @, slashes, spaces). */
export function normalizeTikTokUsername(raw: string | null | undefined): string {
  return String(raw || "")
    .trim()
    .replace(/^@+/, "")
    .replace(/\/+$/g, "")
    .replace(/\s+/g, "")
    .split("/")[0]
    .trim();
}
