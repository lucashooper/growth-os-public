export type AIProviderId =
  | "groq"
  | "openai"
  | "gemini"
  | "claude"
  | "ollama";

export type ChatRole = "system" | "user" | "assistant";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatCompletionRequest = {
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  json?: boolean;
};

export type ChatCompletionResult = {
  content: string;
  provider: AIProviderId;
  model: string;
};

export type AIProvider = {
  id: AIProviderId;
  label: string;
  complete(req: ChatCompletionRequest): Promise<ChatCompletionResult>;
};

export type ProviderStatus = {
  id: AIProviderId;
  label: string;
  configured: boolean;
  model: string;
  isDefault: boolean;
};

export const PROVIDER_META: Record<
  AIProviderId,
  { label: string; envKey: string; modelEnv: string; defaultModel: string }
> = {
  groq: {
    label: "Groq",
    envKey: "GROQ_API_KEY",
    modelEnv: "GROQ_MODEL",
    defaultModel: "qwen/qwen3.6-27b",
  },
  openai: {
    label: "OpenAI",
    envKey: "OPENAI_API_KEY",
    modelEnv: "OPENAI_MODEL",
    defaultModel: "gpt-4o",
  },
  gemini: {
    label: "Gemini",
    envKey: "GEMINI_API_KEY",
    modelEnv: "GEMINI_MODEL",
    defaultModel: "gemini-2.0-flash",
  },
  claude: {
    label: "Claude",
    envKey: "ANTHROPIC_API_KEY",
    modelEnv: "ANTHROPIC_MODEL",
    defaultModel: "claude-sonnet-4-20250514",
  },
  ollama: {
    label: "Ollama",
    envKey: "OLLAMA_BASE_URL",
    modelEnv: "OLLAMA_MODEL",
    defaultModel: "llama3.2",
  },
};
