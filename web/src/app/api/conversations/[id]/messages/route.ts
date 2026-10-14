import { prisma } from "@/lib/db";
import { fail, ok } from "@/lib/api-response";
import {
  AuthError,
  requireProjectAccess,
  requireWorkspaceAccess,
} from "@/lib/api-auth";
import { completeLogged } from "@/lib/ai/logged";
import { logger } from "@/lib/logger";
import {
  buildInsightReport,
  serializeInsightReport,
} from "@/services/analytics";
import { enrichTikTokUrls } from "@/services/tiktok-oembed";
import { withApi } from "@/lib/api-route";


export const runtime = "nodejs";
export const maxDuration = 60;

async function buildContext(projectId: string | null) {
  if (!projectId) {
    return { text: "No project selected.", citeableIds: [] as string[], competitors: [] as NonNullable<Awaited<ReturnType<typeof buildInsightReport>>>["competitors"] };
  }
  const report = await buildInsightReport(projectId);
  if (!report) {
    return {
      text: "Project not found.",
      citeableIds: [] as string[],
      competitors: [] as NonNullable<Awaited<ReturnType<typeof buildInsightReport>>>["competitors"],
    };
  }

  return {
    text: serializeInsightReport(report),
    citeableIds: report.citeablePostIds,
    competitorPostIds: report.competitors.flatMap((c) => c.posts.map((p) => p.id)),
    competitors: report.competitors,
  };
}

async function handlePOST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      content?: string;
      attachments?: { name: string; url: string; mime: string }[];
      stream?: boolean;
    };

    if (!body.content?.trim() && !body.attachments?.length) {
      return fail("content or attachments required", 400);
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { messages: { orderBy: { createdAt: "asc" }, take: 40 } },
    });
    if (!conversation) return fail("Conversation not found", 404);
    await requireWorkspaceAccess(conversation.workspaceId);
    if (conversation.projectId) {
      await requireProjectAccess(conversation.projectId);
    }

    const { assertUsageAllowed, UsageLimitError } = await import(
      "@/services/usage"
    );
    try {
      await assertUsageAllowed(conversation.workspaceId, "chat");
    } catch (err) {
      if (err instanceof UsageLimitError) {
        return fail(err.message, 429);
      }
      throw err;
    }

    const userContent = body.content?.trim() || "(attached images)";
    const attachments = body.attachments ?? [];

    await prisma.message.create({
      data: {
        conversationId: id,
        role: "user",
        content: userContent,
        attachmentsJson: JSON.stringify(attachments),
      },
    });

    let ctx: Awaited<ReturnType<typeof buildContext>>;
    try {
      ctx = await buildContext(conversation.projectId);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to load chat context";
      logger.error("ai", "Chat context failed", {
        conversationId: id,
        message,
      });
      return fail(
        `Chat failed to load workspace data: ${message}`,
        503,
      );
    }
    logger.info("ai", "Chat message received", {
      conversationId: id,
      projectId: conversation.projectId,
      attachments: attachments.length,
    });

    const competitorList = (ctx.competitors || [])
      .map(
        (c) =>
          `[[competitor:${c.id}]] @${c.handle} · ${c.followers} followers · avg ${c.avgViews} views · top “${c.topHook}”`,
      )
      .join("\n");

    const system = `You are a senior growth strategist inside an AI Growth OS.
You receive a computed INSIGHT_REPORT. Backend already calculated all metrics — you explain them.
Rules:
- Only use metrics from the report for OWN and COMPETITOR posts
- NEVER invent TikTok video ids or say "TikTok video 766..." — always use the hook/title
- When discussing top/bottom posts, ALWAYS cite each one as [[post:ID]] on its own line BEFORE explaining it (the UI renders a thumbnail card)
- When analysing competitors, cite each account as [[competitor:ID]] on its own line (UI renders profile cards). Then cite top videos as [[cpost:ID]].
- Keep prose short and clean — cards carry the media. Prefer: cards first, then 2–4 sentence insight.
- When recommending external/inspiring TikToks (not in the report), paste the full https://www.tiktok.com/@…/video/… URL on its own line (no markdown links).
- Explain WHY using engagement, relative rank, hashtags, posting times
- If data is missing, say so
Formatting:
- Do NOT use markdown headers (###) or bold hashtag dumps
- Do NOT invent follower counts or view counts for external accounts unless given
- Prefer short numbered lists (3–5 items max) with plain sentences
- Mention hashtags sparingly (1–3 inline), never a long hashtag catalogue

KNOWN COMPETITORS (use these IDs):
${competitorList || "(none synced yet)"}

PROJECT CONTEXT:
${ctx.text}`;

    const history = conversation.messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    const userMsg =
      attachments.length > 0
        ? `${userContent}\n\n[User attached ${attachments.length} file(s): ${attachments.map((a) => a.name).join(", ")}]`
        : userContent;

    async function resolveCited(content: string) {
      const postIds = [
        ...new Set(
          [...content.matchAll(/\[\[post:([a-zA-Z0-9_-]+)\]\]/g)].map((m) => m[1]),
        ),
      ];
      const cpostIds = [
        ...new Set(
          [...content.matchAll(/\[\[cpost:([a-zA-Z0-9_-]+)\]\]/g)].map((m) => m[1]),
        ),
      ];
      const competitorIds = [
        ...new Set(
          [...content.matchAll(/\[\[competitor:([a-zA-Z0-9_-]+)\]\]/g)].map((m) => m[1]),
        ),
      ];

      // If user asked about competitors but model forgot markers, attach all known ones
      const wantsCompetitors = /competitor/i.test(userContent);
      const autoCompetitorIds =
        wantsCompetitors && !competitorIds.length
          ? (ctx.competitors || []).map((c) => c.id).slice(0, 8)
          : competitorIds;

      let embeds: Awaited<ReturnType<typeof enrichTikTokUrls>> = [];
      try {
        embeds = await enrichTikTokUrls(content);
      } catch (err) {
        logger.warn("ai", "TikTok oEmbed enrichment failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }

      const [posts, cposts, competitors] = await Promise.all([
        prisma.post.findMany({ where: { id: { in: postIds } } }),
        prisma.competitorPost.findMany({
          where: { id: { in: cpostIds } },
          include: { competitor: true },
        }),
        autoCompetitorIds.length
          ? prisma.competitor.findMany({
              where: { id: { in: autoCompetitorIds } },
              include: {
                posts: { orderBy: { views: "desc" }, take: 3 },
              },
            })
          : Promise.resolve([]),
      ]);

      const fromDb = [
        ...posts.map((p) => ({
          id: p.id,
          hook: p.hook,
          coverUrl: p.coverUrl,
          shareUrl: p.shareUrl,
          views: p.views,
          likes: p.likes,
          comments: p.comments,
          publishedAt: p.publishedAt,
          status: p.status,
        })),
        ...cposts.map((p) => ({
          id: p.id,
          hook: p.hook,
          coverUrl: p.coverUrl,
          shareUrl: p.shareUrl,
          views: p.views,
          likes: p.likes,
          comments: p.comments,
          publishedAt: p.publishedAt,
          status: "competitor",
        })),
      ];
      const knownUrls = new Set(
        fromDb.map((p) => p.shareUrl).filter(Boolean) as string[],
      );
      const embedCards = embeds
        .filter((e) => !knownUrls.has(e.shareUrl))
        .map((e) => ({
          id: e.id,
          hook: e.hook,
          coverUrl: e.coverUrl,
          shareUrl: e.shareUrl,
          views: e.views,
          likes: e.likes,
          comments: e.comments,
          publishedAt: null as string | null,
          status: "external",
          authorName: e.authorName,
        }));

      if (embeds.length < (content.match(/tiktok\.com/gi) || []).length) {
        logger.warn("ai", "Some TikTok URLs failed oEmbed", {
          urlsFound: (content.match(/tiktok\.com/gi) || []).length,
          embedsOk: embeds.length,
        });
      }

      let competitorCards: Array<{
        id: string;
        handle: string;
        avatar: string;
        followers: number;
        avgViews: number;
        topHook: string;
        bio: string;
        shareUrl: string;
        whyItWorks: string;
        posts: Array<{
          id: string;
          hook: string;
          coverUrl: string | null;
          shareUrl: string | null;
          views: number;
        }>;
      }> = competitors.map((c) => ({
        id: c.id,
        handle: c.handle,
        avatar: c.avatar,
        followers: c.followers,
        avgViews: c.avgViews,
        topHook: c.topHook,
        bio: c.bio,
        shareUrl: `https://www.tiktok.com/@${c.handle.replace(/^@/, "")}`,
        whyItWorks: c.topHook
          ? `Top hook “${c.topHook}” drives their avg ${c.avgViews} views — study angle + pacing.`
          : `Averaging ${c.avgViews} views across synced posts.`,
        posts: c.posts.map((p) => ({
          id: p.id,
          hook: p.hook,
          coverUrl: p.coverUrl,
          shareUrl: p.shareUrl,
          views: p.views,
        })),
      }));

      // Fallback from insight report if DB query empty
      if (!competitorCards.length && autoCompetitorIds.length && ctx.competitors?.length) {
        competitorCards = ctx.competitors
          .filter((c) => autoCompetitorIds.includes(c.id))
          .map((c) => ({
            id: c.id,
            handle: c.handle,
            avatar: "",
            followers: c.followers,
            avgViews: c.avgViews,
            topHook: c.topHook,
            bio: "",
            shareUrl: `https://www.tiktok.com/@${c.handle.replace(/^@/, "")}`,
            whyItWorks: `Avg ${c.avgViews} views · top “${c.topHook}”`,
            posts: c.posts.slice(0, 3).map((p) => ({
              id: p.id,
              hook: p.hook,
              coverUrl: p.coverUrl,
              shareUrl: p.shareUrl,
              views: p.views,
            })),
          }));
      }

      return {
        citedPosts: [...fromDb, ...embedCards],
        competitorCards,
      };
    }

    if (body.stream !== false) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(
              encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
            );
          };

          try {
            send("status", { status: "thinking" });
            const result = await completeLogged(
              {
                messages: [
                  { role: "system", content: system },
                  ...history,
                  { role: "user", content: userMsg },
                ],
                temperature: 0.55,
                maxTokens: 2048,
              },
              {
                action: "chat",
                projectId: conversation.projectId,
                meta: { conversationId: id },
              },
            );

            const words = result.content.split(/(\s+)/);
            for (const w of words) {
              send("token", { token: w });
              await new Promise((r) => setTimeout(r, 6));
            }

            const resolved = await resolveCited(result.content);
            const metaJson = JSON.stringify({
              citedPosts: resolved.citedPosts,
              competitorCards: resolved.competitorCards,
            });

            const saved = await prisma.message.create({
              data: {
                conversationId: id,
                role: "assistant",
                content: result.content,
                metaJson,
              },
            });

            if (conversation.title === "New chat") {
              await prisma.conversation.update({
                where: { id },
                data: { title: userContent.slice(0, 60), updatedAt: new Date() },
              });
            } else {
              await prisma.conversation.update({
                where: { id },
                data: { updatedAt: new Date() },
              });
            }

            send("done", {
              message: saved,
              provider: result.provider,
              model: result.model,
              citedPosts: resolved.citedPosts,
              competitorCards: resolved.competitorCards,
            });
            controller.close();
          } catch (err) {
            const message = err instanceof Error ? err.message : "AI failed";
            logger.error("ai", message);
            send("error", { error: message, retryable: true });
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    const result = await completeLogged(
      {
        messages: [
          { role: "system", content: system },
          ...history,
          { role: "user", content: userMsg },
        ],
      },
      { action: "chat", projectId: conversation.projectId },
    );
    const resolved = await resolveCited(result.content);
    const saved = await prisma.message.create({
      data: {
        conversationId: id,
        role: "assistant",
        content: result.content,
        metaJson: JSON.stringify({
          citedPosts: resolved.citedPosts,
          competitorCards: resolved.competitorCards,
        }),
      },
    });
    return ok({
      message: saved,
      provider: result.provider,
      model: result.model,
      citedPosts: resolved.citedPosts,
      competitorCards: resolved.competitorCards,
    });
  } catch (err) {
    if (err instanceof AuthError) return fail(err.message, err.status);
    return fail(err, 500, "ai");
  }
}

export const POST = withApi(handlePOST, "POST src/app/api/conversations/[id]/messages/route.ts");
