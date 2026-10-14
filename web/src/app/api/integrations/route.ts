import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, guardProjectId, requireProjectAccess } from "@/lib/api-auth";
import {
  decryptIntegrationSecret,
  encryptIntegrationSecret,
  maskSecret,
} from "@/lib/integrations-crypto";
import {
  INTEGRATION_CATALOG,
  pingIntegration,
  type IntegrationProvider,
} from "@/services/integrations";
import { withApi } from "@/lib/api-route";

export const runtime = "nodejs";

async function workspaceForProject(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project) throw new Error("Project not found");
  return project.workspaceId;
}

async function handleGET(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) return fail("projectId required", 400);
    await guardProjectId(projectId);

    const workspaceId = await workspaceForProject(projectId);
    let rows: Awaited<ReturnType<typeof prisma.workspaceIntegration.findMany>> = [];
    try {
      rows = await prisma.workspaceIntegration.findMany({
        where: { workspaceId },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!/does not exist|no such table/i.test(message)) throw err;
    }

    const byProvider = new Map(rows.map((r) => [r.provider, r]));

    return ok({
      integrations: INTEGRATION_CATALOG.map((def) => {
        const row = byProvider.get(def.id);
        const decrypted = row?.apiKeyEncrypted
          ? decryptIntegrationSecret(row.apiKeyEncrypted)
          : "";
        return {
          ...def,
          isActive: row?.isActive ?? false,
          maskedKey: decrypted ? maskSecret(decrypted) : "",
          updatedAt: row?.updatedAt?.toISOString() ?? null,
        };
      }),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handlePUT(req: Request) {
  try {
    const body = (await req.json()) as {
      projectId?: string;
      provider?: IntegrationProvider;
      apiKey?: string;
    };
    if (!body.projectId || !body.provider || !body.apiKey) {
      return fail("projectId, provider, and apiKey required", 400);
    }
    await requireProjectAccess(body.projectId);

    const valid = INTEGRATION_CATALOG.some((d) => d.id === body.provider);
    if (!valid) return fail("Unknown provider", 400);

    const ping = await pingIntegration(body.provider, body.apiKey);
    if (!ping.ok) return fail(ping.message, 400);

    const workspaceId = await workspaceForProject(body.projectId);
    const encrypted = encryptIntegrationSecret(body.apiKey.trim());

    const row = await prisma.workspaceIntegration.upsert({
      where: {
        workspaceId_provider: {
          workspaceId,
          provider: body.provider,
        },
      },
      create: {
        workspaceId,
        provider: body.provider,
        apiKeyEncrypted: encrypted,
        isActive: true,
      },
      update: {
        apiKeyEncrypted: encrypted,
        isActive: true,
      },
    });

    return ok({
      integration: {
        provider: row.provider,
        isActive: row.isActive,
        maskedKey: maskSecret(body.apiKey.trim()),
        message: ping.message,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handleDELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    const provider = url.searchParams.get("provider") as IntegrationProvider | null;
    if (!projectId || !provider) return fail("projectId and provider required", 400);
    await requireProjectAccess(projectId);

    const workspaceId = await workspaceForProject(projectId);
    await prisma.workspaceIntegration.deleteMany({
      where: { workspaceId, provider },
    });
    return ok({ disconnected: true });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/integrations/route.ts");
export const PUT = withApi(handlePUT, "PUT src/app/api/integrations/route.ts");
export const DELETE = withApi(handleDELETE, "DELETE src/app/api/integrations/route.ts");
