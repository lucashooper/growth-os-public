import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const users = await p.user.findMany({
  select: { id: true, email: true, name: true },
});
const ws = await p.workspace.findMany({
  select: { id: true, name: true, slug: true },
});
const members = await p.workspaceMember.findMany({
  select: { userId: true, workspaceId: true, role: true },
});
const projects = await p.project.findMany({
  select: { id: true, name: true, workspaceId: true },
});
const posts = await p.post.count();
const accounts = await p.connectedAccount.count();
console.log(
  JSON.stringify({ users, ws, members, projects, posts, accounts }, null, 2),
);
await p.$disconnect();
