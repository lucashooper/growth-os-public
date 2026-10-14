import "server-only";

import { complete, type AIProviderId } from "@/lib/ai";
import type { ChatCompletionRequest, ChatCompletionResult } from "@/lib/ai/types";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function completeLogged(
  req: ChatCompletionRequest,
  options?: {
    action?: string;
    projectId?: string | null;
    provider?: AIProviderId;
    meta?: Record<string, unknown>;
  },
): Promise<ChatCompletionResult> {
  const action = options?.action || "complete";
  const started = Date.now();
  const promptPreview = req.messages.map((m) => ({
    role: m.role,
    content:
      typeof m.content === "string"
        ? m.content.slice(0, 4000)
        : JSON.stringify(m.content).slice(0, 4000),
  }));

  try {
    const result = await complete(req, options?.provider);
    const latencyMs = Date.now() - started;

    await prisma.aiLog.create({
      data: {
        projectId: options?.projectId ?? null,
        action,
        provider: result.provider,
        model: result.model,
        promptJson: JSON.stringify(promptPreview),
        responseText: result.content.slice(0, 20_000),
        tokensIn: Math.ceil(
          promptPreview.reduce((s, m) => s + m.content.length, 0) / 4,
        ),
        tokensOut: Math.ceil(result.content.length / 4),
        latencyMs,
        ok: true,
        metaJson: JSON.stringify(options?.meta ?? {}),
      },
    });

    logger.info("ai", `${action} ok`, {
      provider: result.provider,
      model: result.model,
      latencyMs,
      projectId: options?.projectId,
    });

    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const latencyMs = Date.now() - started;
    await prisma.aiLog.create({
      data: {
        projectId: options?.projectId ?? null,
        action,
        provider: options?.provider || "",
        model: "",
        promptJson: JSON.stringify(promptPreview),
        responseText: "",
        latencyMs,
        ok: false,
        error: message,
        metaJson: JSON.stringify(options?.meta ?? {}),
      },
    });
    logger.error("ai", `${action} failed`, {
      error: message,
      latencyMs,
      provider: options?.provider,
      projectId: options?.projectId,
      promptChars: promptPreview.reduce((s, m) => s + m.content.length, 0),
      systemPreview: promptPreview.find((m) => m.role === "system")?.content.slice(0, 200),
      userPreview: promptPreview.find((m) => m.role === "user")?.content.slice(0, 400),
      meta: options?.meta,
    });
    throw err;
  }
}
