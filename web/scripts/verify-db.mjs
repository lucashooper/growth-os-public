import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const accounts = await prisma.connectedAccount.findMany({
  include: { _count: { select: { posts: true } } },
});
for (const a of accounts) {
  console.log({
    user: a.username,
    followers: a.followers,
    videoCount: a.videoCount,
    hearts: a.hearts,
    posts: a._count.posts,
    avatar: a.avatar.startsWith("http") ? "url" : a.avatar,
    bio: a.bio.slice(0, 50),
  });
}
const sum = await prisma.post.aggregate({
  where: { status: "published" },
  _sum: { views: true, likes: true },
  _count: true,
});
console.log("published posts", sum);
await prisma.$disconnect();
