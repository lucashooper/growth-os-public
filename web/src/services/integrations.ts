import "server-only";

export type IntegrationProvider =
  | "heygen"
  | "elevenlabs"
  | "reelfarm"
  | "openai"
  | "claude";

export type IntegrationDefinition = {
  id: IntegrationProvider;
  name: string;
  description: string;
  docsUrl?: string;
};

export const INTEGRATION_CATALOG: IntegrationDefinition[] = [
  {
    id: "heygen",
    name: "HeyGen",
    description: "AI avatar and video generation sync.",
    docsUrl: "https://docs.heygen.com/",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "Voiceover narration and automated TTS generation.",
    docsUrl: "https://elevenlabs.io/docs",
  },
  {
    id: "reelfarm",
    name: "Reel.Farm / Custom UGC",
    description: "Automated video raw-footage ingestion.",
  },
  {
    id: "openai",
    name: "OpenAI API",
    description: "Custom LLM keys for niche carousel copy generation.",
    docsUrl: "https://platform.openai.com/docs",
  },
  {
    id: "claude",
    name: "Claude API",
    description: "Anthropic models for long-form hooks and scripts.",
    docsUrl: "https://docs.anthropic.com/",
  },
];

export async function pingIntegration(
  provider: IntegrationProvider,
  apiKey: string,
): Promise<{ ok: boolean; message: string }> {
  const key = apiKey.trim();
  if (!key) return { ok: false, message: "API key is required." };

  try {
    switch (provider) {
      case "heygen": {
        const res = await fetch("https://api.heygen.com/v2/avatars", {
          headers: { "X-Api-Key": key, Accept: "application/json" },
        });
        if (res.ok) return { ok: true, message: "HeyGen connection verified." };
        return { ok: false, message: `HeyGen rejected key (${res.status}).` };
      }
      case "elevenlabs": {
        const res = await fetch("https://api.elevenlabs.io/v1/user", {
          headers: { "xi-api-key": key, Accept: "application/json" },
        });
        if (res.ok) return { ok: true, message: "ElevenLabs connection verified." };
        return { ok: false, message: `ElevenLabs rejected key (${res.status}).` };
      }
      case "openai": {
        const res = await fetch("https://api.openai.com/v1/models", {
          headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
        });
        if (res.ok) return { ok: true, message: "OpenAI connection verified." };
        return { ok: false, message: `OpenAI rejected key (${res.status}).` };
      }
      case "claude": {
        const res = await fetch("https://api.anthropic.com/v1/models", {
          headers: {
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            Accept: "application/json",
          },
        });
        if (res.ok) return { ok: true, message: "Claude connection verified." };
        return { ok: false, message: `Claude rejected key (${res.status}).` };
      }
      case "reelfarm":
        if (key.length >= 8) {
          return { ok: true, message: "Reel.Farm key saved (manual verification)." };
        }
        return { ok: false, message: "Enter a valid Reel.Farm API key." };
      default:
        return { ok: false, message: "Unknown provider." };
    }
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : "Connection test failed.",
    };
  }
}
