import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import { AuthError, requireProjectAccess } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";

async function handleGET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const post = await prisma.post.findUnique({ where: { id } });
    if (!post) return fail("Post not found", 404);
    await requireProjectAccess(post.projectId);
    return ok({
      post: {
        ...post,
        slides: JSON.parse(post.slidesJson || "[]"),
        meta: JSON.parse(post.metaJson || "{}"),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handlePATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) return fail("Post not found", 404);
    await requireProjectAccess(existing.projectId);

    const body = (await req.json()) as {
      status?: string;
      scheduledAt?: string | null;
      coverUrl?: string;
      caption?: string;
      hook?: string;
      accountId?: string | null;
      /** Schedule into weekly queue */
      queue?: { day: string; time: string } | null;
      meta?: Record<string, unknown>;
    };

    const data: {
      status?: string;
      scheduledAt?: Date | null;
      coverUrl?: string;
      caption?: string;
      hook?: string;
      accountId?: string | null;
      metaJson?: string;
    } = {};

    if (body.status != null) data.status = body.status;
    if (body.coverUrl != null) data.coverUrl = body.coverUrl;
    if (body.caption != null) data.caption = body.caption;
    if (body.hook != null) data.hook = body.hook;
    if (body.accountId !== undefined) data.accountId = body.accountId;
    if (body.meta != null) {
      const prev = JSON.parse(existing.metaJson || "{}") as Record<string, unknown>;
      data.metaJson = JSON.stringify({ ...prev, ...body.meta });
    }
    if (body.scheduledAt === null) data.scheduledAt = null;
    else if (body.scheduledAt) data.scheduledAt = new Date(body.scheduledAt);

    if (body.queue) {
      data.status = body.status || "scheduled";
      const when = nextDateForDayTime(body.queue.day, body.queue.time);
      data.scheduledAt = when;
      await prisma.queueItem.create({
        data: {
          projectId: existing.projectId,
          postId: existing.id,
          day: body.queue.day,
          time: body.queue.time,
          hook: existing.hook,
          status: "scheduled",
        },
      });
    }

    const post = await prisma.post.update({
      where: { id },
      data,
    });

    logger.info("api", "Post updated", { id, status: post.status });
    return ok({
      post: {
        ...post,
        slides: JSON.parse(post.slidesJson || "[]"),
        meta: JSON.parse(post.metaJson || "{}"),
      },
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

async function handleDELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) return fail("Post not found", 404);
    await requireProjectAccess(existing.projectId);

    await prisma.queueItem.deleteMany({ where: { postId: id } });
    await prisma.libraryAsset.deleteMany({ where: { postId: id } });
    await prisma.post.delete({ where: { id } });

    logger.info("api", "Post deleted", { id });
    return ok({ deleted: true });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err);
  }
}

function nextDateForDayTime(day: string, time: string) {
  const days = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
  ];
  const target = days.findIndex((d) => d.toLowerCase() === day.toLowerCase());
  const [hh, mm] = time.split(":").map((n) => Number(n) || 0);
  const now = new Date();
  const out = new Date(now);
  out.setHours(hh, mm, 0, 0);
  const delta = (target - now.getDay() + 7) % 7;
  out.setDate(now.getDate() + (delta === 0 && out <= now ? 7 : delta));
  return out;
}

export const GET = withApi(handleGET, "GET src/app/api/posts/[id]/route.ts");

export const PATCH = withApi(handlePATCH, "PATCH src/app/api/posts/[id]/route.ts");

export const DELETE = withApi(handleDELETE, "DELETE src/app/api/posts/[id]/route.ts");
