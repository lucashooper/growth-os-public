-- Creator Outreach tables (Postgres)
-- Run in Supabase SQL editor if `public.CreatorLead` is missing,
-- OR: DATABASE_URL=<postgres pooler url> npx prisma db push

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
);

CREATE UNIQUE INDEX IF NOT EXISTS "CreatorLead_workspaceId_platform_username_key"
  ON "CreatorLead"("workspaceId", "platform", "username");
CREATE INDEX IF NOT EXISTS "CreatorLead_workspaceId_status_idx"
  ON "CreatorLead"("workspaceId", "status");
CREATE INDEX IF NOT EXISTS "CreatorLead_projectId_idx"
  ON "CreatorLead"("projectId");

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
);

CREATE INDEX IF NOT EXISTS "OutreachCampaign_workspaceId_idx"
  ON "OutreachCampaign"("workspaceId");
CREATE INDEX IF NOT EXISTS "OutreachCampaign_projectId_idx"
  ON "OutreachCampaign"("projectId");
