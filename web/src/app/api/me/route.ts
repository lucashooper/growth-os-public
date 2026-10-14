import { ok, fail } from "@/lib/api-response";
import { AuthError, requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { withApi } from "@/lib/api-route";
import { deleteUserAccount } from "@/services/account-deletion";

export const runtime = "nodejs";

async function handleGET() {
  try {
    const user = await requireUser();
    const workspaceIds = await prisma.workspaceMember.findMany({
      where: { userId: user.id },
      select: { workspaceId: true },
    });
    const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
    return ok({
      user: {
        ...user,
        name: dbUser?.name || user.name,
        avatarUrl: dbUser?.avatarUrl || "",
        email: dbUser?.email || user.email,
      },
      workspaceIds: workspaceIds.map((m) => m.workspaceId),
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handlePATCH(req: Request) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { name?: string; avatarUrl?: string };
    const data: { name?: string; avatarUrl?: string } = {};
    if (typeof body.name === "string") data.name = body.name.trim().slice(0, 80);
    if (typeof body.avatarUrl === "string") data.avatarUrl = body.avatarUrl.trim();

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });

    return ok({
      user: {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        avatarUrl: updated.avatarUrl,
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handleDELETE() {
  try {
    const user = await requireUser();
    await deleteUserAccount(user.id);
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

export const GET = withApi(handleGET, "GET src/app/api/me/route.ts");
export const PATCH = withApi(handlePATCH, "PATCH src/app/api/me/route.ts");
export const DELETE = withApi(handleDELETE, "DELETE src/app/api/me/route.ts");
