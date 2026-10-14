/**
 * Attach the Supabase user in OWNER_EMAIL as Owner of an existing workspace.
 *
 * Usage:
 *   OWNER_EMAIL=you@example.com LEGACY_WORKSPACE_SLUG=my-workspace node scripts/migrate-owner.mjs
 */
import { PrismaClient } from "@prisma/client";

const TARGET_EMAIL = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
if (!TARGET_EMAIL) {
  console.error("Set OWNER_EMAIL to the account that should own the workspace.");
  process.exit(1);
}
const LEGACY_SLUG = (process.env.LEGACY_WORKSPACE_SLUG || "").trim();
const LEGACY_NAME = (process.env.LEGACY_WORKSPACE_NAME || "").trim();

const p = new PrismaClient();

const target = await p.user.findUnique({ where: { email: TARGET_EMAIL } });
if (!target) {
  console.error(
    `No User row for ${TARGET_EMAIL}. Sign up / sign in once first so provisionUserWorkspace creates the row.`,
  );
  process.exit(1);
}

const legacy = await p.workspace.findFirst({
  where:
    LEGACY_SLUG || LEGACY_NAME
      ? {
          OR: [
            ...(LEGACY_SLUG ? [{ slug: LEGACY_SLUG }] : []),
            ...(LEGACY_NAME ? [{ name: LEGACY_NAME }] : []),
          ],
        }
      : undefined,
  orderBy: { createdAt: "asc" },
  include: {
    projects: { select: { id: true, name: true } },
    _count: { select: { projects: true } },
  },
});

if (!legacy) {
  console.error("Legacy workspace not found.");
  process.exit(1);
}

await p.workspaceMember.upsert({
  where: {
    workspaceId_userId: { workspaceId: legacy.id, userId: target.id },
  },
  create: {
    workspaceId: legacy.id,
    userId: target.id,
    role: "Owner",
  },
  update: { role: "Owner" },
});

await p.systemFlag.upsert({
  where: { key: "legacy_claimed" },
  create: { key: "legacy_claimed", value: "true" },
  update: { value: "true" },
});

// Soft-retire the empty auto-created workspace if it has only "My Project" and no posts
const emptyWs = await p.workspace.findFirst({
  where: {
    members: { some: { userId: target.id } },
    NOT: { id: legacy.id },
  },
  include: {
    projects: { include: { _count: { select: { posts: true, accounts: true } } } },
  },
});

let cleaned = null;
if (emptyWs) {
  const totalPosts = emptyWs.projects.reduce((n, pr) => n + pr._count.posts, 0);
  const totalAccounts = emptyWs.projects.reduce(
    (n, pr) => n + pr._count.accounts,
    0,
  );
  if (totalPosts === 0 && totalAccounts === 0) {
    await p.workspace.delete({ where: { id: emptyWs.id } });
    cleaned = emptyWs.name;
  }
}

const posts = await p.post.count({
  where: { project: { workspaceId: legacy.id } },
});
const accounts = await p.connectedAccount.count({
  where: { project: { workspaceId: legacy.id } },
});

console.log(
  JSON.stringify(
    {
      ok: true,
      owner: { id: target.id, email: target.email },
      workspace: {
        id: legacy.id,
        name: legacy.name,
        projects: legacy.projects.map((x) => x.name),
        posts,
        accounts,
      },
      removedEmptyWorkspace: cleaned,
    },
    null,
    2,
  ),
);

await p.$disconnect();
