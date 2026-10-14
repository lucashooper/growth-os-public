import type {
  AIProvider,
  ChatCompletionRequest,
  ChatCompletionResult,
} from "@/lib/ai/types";

export function createClaudeProvider(
  apiKey: string,
  model: string,
): AIProvider {
  return {
    id: "claude",
    label: "Claude",
    async complete(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
      if (!apiKey) throw new Error("Anthropic API key is not configured");

      const system = req.messages
        .filter((m) => m.role === "system")
        .map((m) => m.content)
        .join("\n\n");
      const messages = req.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: req.maxTokens ?? 2048,
          temperature: req.temperature ?? 0.7,
          system: system || undefined,
          messages,
        }),
      });

      if (!res.ok) {
        throw new Error(`Claude error (${res.status}): ${await res.text()}`);
      }

      const data = (await res.json()) as {
        content?: { type: string; text?: string }[];
      };
      const content =
        data.content
          ?.filter((b) => b.type === "text")
          .map((b) => b.text ?? "")
          .join("") ?? "";
      if (!content.trim()) throw new Error("Claude returned an empty response");

      return { content: content.trim(), provider: "claude", model };
    },
  };
}
