/**
 * One-off: ensure every Workspace has a unique slug after schema add.
 * Run: npx tsx scripts/backfill-workspace-slugs.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function slugify(input: string) {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "workspace"
  );
}

async function main() {
  const workspaces = await prisma.workspace.findMany();
  const used = new Set<string>();
  for (const ws of workspaces) {
    let base = ws.slug && ws.slug !== "legacy" ? ws.slug : slugify(ws.name || "workspace");
    let slug = base;
    let n = 1;
    while (used.has(slug) || (await prisma.workspace.findFirst({ where: { slug, NOT: { id: ws.id } } }))) {
      slug = `${base}-${n++}`;
    }
    used.add(slug);
    if (ws.slug !== slug) {
      await prisma.workspace.update({ where: { id: ws.id }, data: { slug } });
      console.log(`Updated ${ws.id} → ${slug}`);
    }
  }
  console.log("Done", workspaces.length);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
