import "server-only";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export type FormatKind = "storytelling" | "informational";

let tableReady: Promise<void> | null = null;

/**
 * Ensure FormatReference exists. Each SQL statement runs in its own
 * $executeRawUnsafe call — Postgres rejects multi-statement prepared queries (42601).
 */
export function ensureFormatReferenceTable(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      try {
        // Prefer Prisma client when the model is available (after migrate + generate)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (prisma as any).formatReference?.findFirst === "function") {
          await (prisma as any).formatReference.findFirst({ take: 1 });
          return;
        }
      } catch {
        /* fall through to create */
      }

      const isPostgres = /^postgres(ql)?:\/\//i.test(
        process.env.DATABASE_URL || "",
      );

      try {
        if (isPostgres) {
          await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "FormatReference" (
              "id" TEXT PRIMARY KEY,
              "projectId" TEXT NOT NULL REFERENCES "Project"("id") ON DELETE CASCADE,
              "format" TEXT NOT NULL DEFAULT 'informational',
              "title" TEXT NOT NULL DEFAULT '',
              "sourceUrl" TEXT NOT NULL DEFAULT '',
              "hook" TEXT NOT NULL DEFAULT '',
              "slidesJson" TEXT NOT NULL DEFAULT '[]',
              "structureNotes" TEXT NOT NULL DEFAULT '',
              "coverUrl" TEXT NOT NULL DEFAULT '',
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
          `);
          await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "FormatReference_projectId_format_idx"
              ON "FormatReference"("projectId", "format")
          `);
        } else {
          await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "FormatReference" (
              "id" TEXT NOT NULL PRIMARY KEY,
              "projectId" TEXT NOT NULL,
              "format" TEXT NOT NULL DEFAULT 'informational',
              "title" TEXT NOT NULL DEFAULT '',
              "sourceUrl" TEXT NOT NULL DEFAULT '',
              "hook" TEXT NOT NULL DEFAULT '',
              "slidesJson" TEXT NOT NULL DEFAULT '[]',
              "structureNotes" TEXT NOT NULL DEFAULT '',
              "coverUrl" TEXT NOT NULL DEFAULT '',
              "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" DATETIME NOT NULL,
              FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE
            )
          `);
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "FormatReference_projectId_format_idx" ON "FormatReference"("projectId", "format")`,
          );
        }
        logger.info("db", "Created FormatReference table");
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/already exists|duplicate/i.test(message)) {
          tableReady = null;
          throw err;
        }
      }
    })();
  }
  return tableReady;
}

export function serializeFormatRef(row: {
  id: string;
  projectId: string;
  format: string;
  title: string;
  sourceUrl: string;
  hook: string;
  slidesJson: string;
  structureNotes: string;
  coverUrl: string;
  createdAt: Date;
  updatedAt: Date;
}) {
  let slides: string[] = [];
  try {
    slides = JSON.parse(row.slidesJson || "[]") as string[];
  } catch {
    slides = [];
  }
  return {
    id: row.id,
    projectId: row.projectId,
    format: (row.format === "storytelling"
      ? "storytelling"
      : "informational") as FormatKind,
    title: row.title,
    sourceUrl: row.sourceUrl,
    hook: row.hook,
    slides,
    structureNotes: row.structureNotes,
    coverUrl: row.coverUrl,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function formatRefDelegate() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (prisma as any).formatReference as
    | {
        findMany: (args: unknown) => Promise<Parameters<typeof serializeFormatRef>[0][]>;
        create: (args: unknown) => Promise<Parameters<typeof serializeFormatRef>[0]>;
        delete: (args: unknown) => Promise<unknown>;
        findFirst: (args: unknown) => Promise<Parameters<typeof serializeFormatRef>[0] | null>;
        findUnique: (args: unknown) => Promise<Parameters<typeof serializeFormatRef>[0] | null>;
      }
    | undefined;
}

export async function listFormatReferences(
  projectId: string,
  format?: FormatKind,
) {
  await ensureFormatReferenceTable();
  const client = formatRefDelegate();
  if (!client?.findMany) {
    throw new Error(
      "FormatReference model unavailable — run prisma generate / db push",
    );
  }
  const rows = await client.findMany({
    where: {
      projectId,
      ...(format ? { format } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(serializeFormatRef);
}

export async function createFormatReference(input: {
  projectId: string;
  format: FormatKind;
  title: string;
  sourceUrl?: string;
  hook?: string;
  slides?: string[];
  structureNotes?: string;
  coverUrl?: string;
}) {
  await ensureFormatReferenceTable();
  const client = formatRefDelegate();
  if (!client?.create) {
    throw new Error(
      "FormatReference model unavailable — run prisma generate / db push",
    );
  }
  const row = await client.create({
    data: {
      projectId: input.projectId,
      format: input.format,
      title: input.title,
      sourceUrl: input.sourceUrl || "",
      hook: input.hook || "",
      slidesJson: JSON.stringify(input.slides || []),
      structureNotes: input.structureNotes || "",
      coverUrl: input.coverUrl || "",
    },
  });
  return serializeFormatRef(row);
}

export async function deleteFormatReference(id: string) {
  await ensureFormatReferenceTable();
  const client = formatRefDelegate();
  if (!client?.delete) {
    throw new Error(
      "FormatReference model unavailable — run prisma generate / db push",
    );
  }
  await client.delete({ where: { id } });
}

export async function getFormatReference(id: string, projectId: string) {
  await ensureFormatReferenceTable();
  const client = formatRefDelegate();
  if (!client?.findFirst) {
    throw new Error(
      "FormatReference model unavailable — run prisma generate / db push",
    );
  }
  const row = await client.findFirst({ where: { id, projectId } });
  return row ? serializeFormatRef(row) : null;
}

export function formatRefPromptBlock(
  refs: ReturnType<typeof serializeFormatRef>[],
) {
  if (!refs.length) return "";
  return refs
    .slice(0, 3)
    .map((r, i) => {
      const slides = r.slides
        .slice(0, 8)
        .map((s, j) => `  Slide ${j + 1}: ${s}`)
        .join("\n");
      return `Reference ${i + 1}: "${r.title || r.hook}" (${r.format})
Exact hook syntax: ${r.hook}
Slide progression:
${slides || "  (structure only — invent matching beats)"}
Notes: ${r.structureNotes || "Match hook cadence, contrast, and slide progression; write FRESH copy — do not copy verbatim."}`;
    })
    .join("\n\n");
}
