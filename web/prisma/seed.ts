import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Minimal seed: workspace + projects only. No fake analytics/posts.
  const existing = await prisma.workspace.findFirst();
  if (existing) {
    console.log("Workspace already exists — skipping seed.");
    return;
  }

  const workspace = await prisma.workspace.create({
    data: {
      name: "My workspace",
      slug: "my-workspace",
      settings: {
        create: [
          { key: "timezone", value: "Europe/London" },
          { key: "ai_provider", value: "groq" },
        ],
      },
      projects: {
        create: [
          {
            name: "Example app",
            slug: "example-app",
            description: "Replace this with your own product",
            color: "oklch(0.72 0.12 160)",
          },
        ],
      },
    },
    include: { projects: true },
  });

  console.log(
    `Seeded workspace ${workspace.id} with ${workspace.projects.length} projects (no mock metrics).`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
