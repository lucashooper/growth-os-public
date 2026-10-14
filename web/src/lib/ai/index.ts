import "server-only";

import { createClaudeProvider } from "@/lib/ai/providers/claude";
import { createGeminiProvider } from "@/lib/ai/providers/gemini";
import { createOpenAICompatibleProvider } from "@/lib/ai/providers/openai-compatible";
import {
  PROVIDER_META,
  type AIProvider,
  type AIProviderId,
  type ChatCompletionRequest,
  type ChatCompletionResult,
  type ProviderStatus,
} from "@/lib/ai/types";

function env(name: string, fallback = ""): string {
  return process.env[name]?.trim() || fallback;
}

/** Groq retired llama-3.3-70b-versatile. Ignore stale env/Netlify values. */
const RETIRED_GROQ_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "llama-3.1-70b-specdec",
  "llama3-70b-8192",
];

function resolveModel(providerId: AIProviderId, fallback: string): string {
  const meta = PROVIDER_META[providerId];
  const raw = env(meta.modelEnv, fallback);
  if (
    providerId === "groq" &&
    RETIRED_GROQ_MODELS.some((retired) => raw.toLowerCase() === retired)
  ) {
    console.warn(
      `[ai] GROQ_MODEL="${raw}" is retired; using ${fallback}. Update GROQ_MODEL in .env and Netlify.`,
    );
    return fallback;
  }
  return raw;
}

export function getDefaultProviderId(): AIProviderId {
  const raw = env("AI_PROVIDER", "groq").toLowerCase();
  if (raw in PROVIDER_META) return raw as AIProviderId;
  return "groq";
}

export function getProvider(id?: AIProviderId): AIProvider {
  const providerId = id ?? getDefaultProviderId();
  const meta = PROVIDER_META[providerId];
  const model = resolveModel(providerId, meta.defaultModel);

  switch (providerId) {
    case "groq":
      return createOpenAICompatibleProvider({
        id: "groq",
        label: "Groq",
        baseUrl: "https://api.groq.com/openai/v1",
        apiKey: env("GROQ_API_KEY"),
        model,
      });
    case "openai":
      return createOpenAICompatibleProvider({
        id: "openai",
        label: "OpenAI",
        baseUrl: "https://api.openai.com/v1",
        apiKey: env("OPENAI_API_KEY"),
        model,
      });
    case "ollama":
      return createOpenAICompatibleProvider({
        id: "ollama",
        label: "Ollama",
        baseUrl: `${env("OLLAMA_BASE_URL", "http://localhost:11434")}/v1`,
        apiKey: "ollama",
        model,
        authHeader: "none",
      });
    case "gemini":
      return createGeminiProvider(env("GEMINI_API_KEY"), model);
    case "claude":
      return createClaudeProvider(env("ANTHROPIC_API_KEY"), model);
    default:
      throw new Error(`Unknown AI provider: ${providerId}`);
  }
}

export async function complete(
  req: ChatCompletionRequest,
  providerId?: AIProviderId,
): Promise<ChatCompletionResult> {
  return getProvider(providerId).complete(req);
}

export function listProviderStatus(): ProviderStatus[] {
  const defaultId = getDefaultProviderId();
  return (Object.keys(PROVIDER_META) as AIProviderId[]).map((id) => {
    const meta = PROVIDER_META[id];
    const configured =
      id === "ollama"
        ? true
        : Boolean(env(meta.envKey));
    return {
      id,
      label: meta.label,
      configured,
      model: resolveModel(id, meta.defaultModel),
      isDefault: id === defaultId,
    };
  });
}

export type { AIProviderId, ChatCompletionRequest, ChatCompletionResult };
