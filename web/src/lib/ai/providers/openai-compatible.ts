import type {
  AIProvider,
  AIProviderId,
  ChatCompletionRequest,
  ChatCompletionResult,
} from "@/lib/ai/types";

type CompatibleConfig = {
  id: AIProviderId;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  authHeader?: "bearer" | "none";
};

/** Shared chat completion for OpenAI-compatible APIs (Groq, OpenAI, Ollama). */
export function createOpenAICompatibleProvider(
  config: CompatibleConfig,
): AIProvider {
  return {
    id: config.id,
    label: config.label,
    async complete(req: ChatCompletionRequest): Promise<ChatCompletionResult> {
      if (config.authHeader !== "none" && !config.apiKey) {
        throw new Error(`${config.label} API key is not configured`);
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (config.authHeader !== "none") {
        headers.Authorization = `Bearer ${config.apiKey}`;
      }

      const maxOut = req.maxTokens ?? 4096;
      const body: Record<string, unknown> = {
        model: config.model,
        messages: req.messages,
        temperature: req.temperature ?? 0.7,
      };
      // Groq chat models: max_completion_tokens only (max_tokens can be ignored/capped oddly)
      if (config.id === "groq") {
        body.max_completion_tokens = maxOut;
        // Qwen on Groq emits thinking tokens that break JSON parsing
        body.reasoning_effort = "none";
        body.reasoning_format = "hidden";
      } else {
        body.max_tokens = maxOut;
      }
      if (req.json) {
        body.response_format = { type: "json_object" };
      }

      const res = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text();
        let detail = errText.slice(0, 1200);
        try {
          const parsed = JSON.parse(errText) as {
            error?: {
              message?: string;
              type?: string;
              code?: string;
              failed_generation?: string;
            };
          };
          const e = parsed.error;
          if (e) {
            detail = [
              e.message,
              e.code ? `code=${e.code}` : null,
              e.type ? `type=${e.type}` : null,
              e.failed_generation
                ? `failed_generation=${e.failed_generation.slice(0, 600)}`
                : null,
            ]
              .filter(Boolean)
              .join(" | ");
          }
        } catch {
          /* use raw errText */
        }
        throw new Error(`${config.label} error (${res.status}): ${detail}`);
      }

      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const content = data.choices?.[0]?.message?.content?.trim() ?? "";
      if (!content) throw new Error(`${config.label} returned an empty response`);

      return {
        content,
        provider: config.id,
        model: config.model,
      };
    },
  };
}
