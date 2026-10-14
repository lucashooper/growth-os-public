import { PrismaClient } from "@prisma/client";

const p = new PrismaClient();
const posts = await p.post.findMany({
  where: { status: "published" },
  orderBy: { views: "desc" },
  take: 15,
  select: {
    hook: true,
    views: true,
    theme: true,
    shareUrl: true,
    accountId: true,
  },
});
const acc = await p.connectedAccount.findMany({
  select: { id: true, username: true, followers: true },
});
console.log(JSON.stringify({ acc, posts }, null, 2));
await p.$disconnect();
