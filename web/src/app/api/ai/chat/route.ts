import { NextResponse } from "next/server";
import { complete, type AIProviderId } from "@/lib/ai";
import type { ChatMessage } from "@/lib/ai/types";
import { AuthError, requireUser } from "@/lib/api-auth";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

type Body = {
  messages: ChatMessage[];
  provider?: AIProviderId;
  system?: string;
  temperature?: number;
};

async function handlePOST(req: Request) {
  try {
    await requireUser();
    const body = (await req.json()) as Body;
    if (!body.messages?.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const messages: ChatMessage[] = body.system
      ? [{ role: "system", content: body.system }, ...body.messages]
      : body.messages;

    const result = await complete(
      {
        messages,
        temperature: body.temperature ?? 0.7,
        maxTokens: 2048,
      },
      body.provider,
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : "AI request failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/ai/chat/route.ts");
