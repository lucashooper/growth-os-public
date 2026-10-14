/** Strip model thinking / markdown wrappers before JSON.parse. */
export function stripModelArtifacts(raw: string): string {
  return raw
    .trim()
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, "")
    .replace(/[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "")
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

export function parseAiJsonObject<T = Record<string, unknown>>(raw: string): T {
  const cleaned = stripModelArtifacts(raw);
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    const objMatch = cleaned.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try {
        return JSON.parse(objMatch[0]) as T;
      } catch {
        /* fall through */
      }
    }
    const arrMatch = cleaned.match(/\[[\s\S]*\]/);
    if (arrMatch) {
      try {
        return JSON.parse(arrMatch[0]) as T;
      } catch {
        /* fall through */
      }
    }
    throw new Error("Model did not return valid JSON");
  }
}
