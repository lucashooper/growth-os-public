import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type MemberRole = "Owner" | "Admin" | "Editor" | "Viewer";

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "workspace"
  );
}

async function uniqueWorkspaceSlug(base: string) {
  let slug = slugify(base);
  let n = 1;
  while (await prisma.workspace.findUnique({ where: { slug } })) {
    slug = `${slugify(base)}-${n++}`;
  }
  return slug;
}

/** Ensure Prisma User row exists for a Supabase auth user. */
export async function ensureAppUser(input: {
  id: string;
  email: string;
  name?: string;
  avatarUrl?: string;
}) {
  const email = input.email.trim().toLowerCase();
  return prisma.user.upsert({
    where: { id: input.id },
    create: {
      id: input.id,
      email,
      name: input.name || email.split("@")[0] || "User",
      avatarUrl: input.avatarUrl || "",
    },
    update: {
      email,
      ...(input.name ? { name: input.name } : {}),
      ...(input.avatarUrl ? { avatarUrl: input.avatarUrl } : {}),
    },
  });
}

/**
 * First OWNER_EMAIL login claims all unowned workspaces.
 * Later signups get a fresh workspace + default project.
 */
export async function provisionUserWorkspace(user: {
  id: string;
  email: string;
  name?: string;
}) {
  await ensureAppUser(user);

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    include: { workspace: true },
  });
  if (membership) return membership.workspace;

  const ownerEmail = (process.env.OWNER_EMAIL || "").trim().toLowerCase();
  const isOwner = Boolean(ownerEmail && user.email.trim().toLowerCase() === ownerEmail);

  const claimed = await prisma.systemFlag.findUnique({ where: { key: "legacy_claimed" } });

  if (isOwner && claimed?.value !== "true") {
    const workspaces = await prisma.workspace.findMany();
    if (workspaces.length > 0) {
      for (const ws of workspaces) {
        // Backfill slug if missing (legacy rows)
        if (!ws.slug) {
          await prisma.workspace.update({
            where: { id: ws.id },
            data: { slug: await uniqueWorkspaceSlug(ws.name || "workspace") },
          });
        }
        await prisma.workspaceMember.upsert({
          where: {
            workspaceId_userId: { workspaceId: ws.id, userId: user.id },
          },
          create: {
            workspaceId: ws.id,
            userId: user.id,
            role: "Owner",
          },
          update: { role: "Owner" },
        });
      }
      await prisma.systemFlag.upsert({
        where: { key: "legacy_claimed" },
        create: { key: "legacy_claimed", value: "true" },
        update: { value: "true" },
      });
      logger.info("api", "Legacy workspaces claimed by owner", {
        userId: user.id,
        email: user.email,
        count: workspaces.length,
      });
      return workspaces[0];
    }
  }

  const name =
    user.name?.trim() ||
    `${user.email.split("@")[0]}'s Workspace`;
  const slug = await uniqueWorkspaceSlug(name);
  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug,
      members: {
        create: { userId: user.id, role: "Owner" },
      },
      projects: {
        create: {
          name: "My Project",
          slug: "my-project",
          description: "Your first Growth OS project",
        },
      },
    },
  });

  logger.info("api", "Created workspace for new user", {
    userId: user.id,
    workspaceId: workspace.id,
  });
  return workspace;
}

export async function getAccessibleProjectIds(userId: string): Promise<string[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  if (!memberships.length) return [];
  const projects = await prisma.project.findMany({
    where: { workspaceId: { in: memberships.map((m) => m.workspaceId) } },
    select: { id: true },
  });
  return projects.map((p) => p.id);
}

export async function getAccessibleWorkspaceIds(userId: string): Promise<string[]> {
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    select: { workspaceId: true },
  });
  return memberships.map((m) => m.workspaceId);
}

export async function userCanAccessProject(
  userId: string,
  projectId: string,
): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project) return false;
  const member = await prisma.workspaceMember.findUnique({
    where: {
      workspaceId_userId: { workspaceId: project.workspaceId, userId },
    },
  });
  return Boolean(member);
}

export async function userCanAccessWorkspace(
  userId: string,
  workspaceId: string,
): Promise<boolean> {
  const member = await prisma.workspaceMember.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
  });
  return Boolean(member);
}
