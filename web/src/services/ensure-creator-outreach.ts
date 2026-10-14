import "server-only";

import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

let tableReady: Promise<void> | null = null;

/**
 * Ensure CreatorLead / OutreachCampaign exist (Postgres prod may lag schema push).
 * Each statement is separate — Postgres rejects multi-statement prepared queries.
 */
export function ensureCreatorOutreachTables(): Promise<void> {
  if (!tableReady) {
    tableReady = (async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (typeof (prisma as any).creatorLead?.findFirst === "function") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (prisma as any).creatorLead.findFirst({ take: 1 });
          return;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!/does not exist|no such table/i.test(msg)) {
          tableReady = null;
          throw err;
        }
      }

      const isPostgres = /^postgres(ql)?:\/\//i.test(
        process.env.DATABASE_URL || "",
      );

      try {
        if (isPostgres) {
          await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "CreatorLead" (
              "id" TEXT PRIMARY KEY,
              "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
              "projectId" TEXT NOT NULL DEFAULT '',
              "platform" TEXT NOT NULL DEFAULT 'tiktok',
              "username" TEXT NOT NULL,
              "displayName" TEXT NOT NULL DEFAULT '',
              "avatarUrl" TEXT NOT NULL DEFAULT '',
              "followerCount" INTEGER NOT NULL DEFAULT 0,
              "bio" TEXT NOT NULL DEFAULT '',
              "email" TEXT NOT NULL DEFAULT '',
              "bioLink" TEXT NOT NULL DEFAULT '',
              "niche" TEXT NOT NULL DEFAULT '',
              "suggestedPitch" TEXT NOT NULL DEFAULT '',
              "emailSubject" TEXT NOT NULL DEFAULT '',
              "status" TEXT NOT NULL DEFAULT 'discovered',
              "sentAt" TIMESTAMP(3),
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
          `);
          await prisma.$executeRawUnsafe(`
            CREATE UNIQUE INDEX IF NOT EXISTS "CreatorLead_workspaceId_platform_username_key"
              ON "CreatorLead"("workspaceId", "platform", "username")
          `);
          await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "CreatorLead_workspaceId_status_idx"
              ON "CreatorLead"("workspaceId", "status")
          `);
          await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "CreatorLead_projectId_idx"
              ON "CreatorLead"("projectId")
          `);
          await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "OutreachCampaign" (
              "id" TEXT PRIMARY KEY,
              "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
              "projectId" TEXT NOT NULL DEFAULT '',
              "name" TEXT NOT NULL DEFAULT '',
              "query" TEXT NOT NULL DEFAULT '',
              "platform" TEXT NOT NULL DEFAULT 'tiktok',
              "status" TEXT NOT NULL DEFAULT 'draft',
              "leadIdsJson" TEXT NOT NULL DEFAULT '[]',
              "sentCount" INTEGER NOT NULL DEFAULT 0,
              "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
          `);
          await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "OutreachCampaign_workspaceId_idx"
              ON "OutreachCampaign"("workspaceId")
          `);
          await prisma.$executeRawUnsafe(`
            CREATE INDEX IF NOT EXISTS "OutreachCampaign_projectId_idx"
              ON "OutreachCampaign"("projectId")
          `);
        } else {
          await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "CreatorLead" (
              "id" TEXT NOT NULL PRIMARY KEY,
              "workspaceId" TEXT NOT NULL,
              "projectId" TEXT NOT NULL DEFAULT '',
              "platform" TEXT NOT NULL DEFAULT 'tiktok',
              "username" TEXT NOT NULL,
              "displayName" TEXT NOT NULL DEFAULT '',
              "avatarUrl" TEXT NOT NULL DEFAULT '',
              "followerCount" INTEGER NOT NULL DEFAULT 0,
              "bio" TEXT NOT NULL DEFAULT '',
              "email" TEXT NOT NULL DEFAULT '',
              "bioLink" TEXT NOT NULL DEFAULT '',
              "niche" TEXT NOT NULL DEFAULT '',
              "suggestedPitch" TEXT NOT NULL DEFAULT '',
              "emailSubject" TEXT NOT NULL DEFAULT '',
              "status" TEXT NOT NULL DEFAULT 'discovered',
              "sentAt" DATETIME,
              "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" DATETIME NOT NULL,
              FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
            )
          `);
          await prisma.$executeRawUnsafe(
            `CREATE UNIQUE INDEX IF NOT EXISTS "CreatorLead_workspaceId_platform_username_key" ON "CreatorLead"("workspaceId", "platform", "username")`,
          );
          await prisma.$executeRawUnsafe(
            `CREATE INDEX IF NOT EXISTS "CreatorLead_workspaceId_status_idx" ON "CreatorLead"("workspaceId", "status")`,
          );
          await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "OutreachCampaign" (
              "id" TEXT NOT NULL PRIMARY KEY,
              "workspaceId" TEXT NOT NULL,
              "projectId" TEXT NOT NULL DEFAULT '',
              "name" TEXT NOT NULL DEFAULT '',
              "query" TEXT NOT NULL DEFAULT '',
              "platform" TEXT NOT NULL DEFAULT 'tiktok',
              "status" TEXT NOT NULL DEFAULT 'draft',
              "leadIdsJson" TEXT NOT NULL DEFAULT '[]',
              "sentCount" INTEGER NOT NULL DEFAULT 0,
              "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
              "updatedAt" DATETIME NOT NULL,
              FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE
            )
          `);
        }
        logger.info("db", "Created CreatorLead / OutreachCampaign tables");
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
