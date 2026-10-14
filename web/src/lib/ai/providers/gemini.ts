import type {
  AIProvider,
  ChatCompletionRequest,
  ChatCompletionResult,
} from "@/lib/ai/types";

export function createGeminiProvider(
  apiKey: string,
  model: string,
): AIProvider {
  return {
    id: "gemini",
    label: "Gemini",
    async complete(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
      if (!apiKey) throw new Error("Gemini API key is not configured");

      const system = req.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      const contents = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        }));

      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: system
            ? { parts: [{ text: system }] }
            : undefined,
          contents,
          generationConfig: {
            temperature: req.temperature ?? 0.7,
            maxOutputTokens: req.maxTokens ?? 2048,
            responseMimeType: req.json ? "application/json" : "text/plain",
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`Gemini error (${res.status}): ${await res.text()}`);
      }

      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
      };
      const content =
        data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ??
        "";
      if (!content.trim()) throw new Error("Gemini returned an empty response");

      return { content: content.trim(), provider: "gemini", model };
    },
  };
}
