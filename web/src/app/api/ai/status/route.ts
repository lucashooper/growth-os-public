import { NextResponse } from "next/server";
import { listProviderStatus } from "@/lib/ai";
import { AuthError, requireUser } from "@/lib/api-auth";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET() {
  try {
    await requireUser();
    return NextResponse.json({ providers: listProviderStatus() });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    return NextResponse.json({ error: "Status failed" }, { status: 500 });
  }
}

export const GET = withApi(handleGET, "GET src/app/api/ai/status/route.ts");
