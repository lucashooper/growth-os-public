-- CreateTable (SQLite / Postgres compatible via prepare-prisma)
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
    "updatedAt" DATETIME NOT NULL
);

CREATE INDEX IF NOT EXISTS "FormatReference_projectId_format_idx" ON "FormatReference"("projectId", "format");
