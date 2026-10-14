-- Growth OS — incremental migration for Deep Intelligence Engine
-- Safe to run on an EXISTING Supabase database (does NOT recreate User/Project/etc).
-- Run this in Supabase SQL Editor — do NOT re-run the full schema.sql.

-- ── Competitor: new columns ──────────────────────────────────────────
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "slug" TEXT;
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "name" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'tiktok';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "websiteUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "appStoreUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "playStoreUrl" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "metaPageId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "instagram" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "facebookPage" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "twitter" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "youtube" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "syncCadence" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "nextSyncAt" TIMESTAMP(3);
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "aiSummary" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "aiSummaryAt" TIMESTAMP(3);
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "signalsJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Competitor" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill slug from handle where missing
UPDATE "Competitor"
SET "slug" = LOWER(REGEXP_REPLACE(COALESCE(NULLIF("handle", ''), "id"), '[^a-zA-Z0-9]+', '-', 'g'))
WHERE "slug" IS NULL OR "slug" = '';

ALTER TABLE "Competitor" ALTER COLUMN "slug" SET NOT NULL;
ALTER TABLE "Competitor" ALTER COLUMN "handle" SET DEFAULT '';

-- Drop old unique(handle) if present; add unique(projectId, slug)
DO $$ BEGIN
  ALTER TABLE "Competitor" DROP CONSTRAINT IF EXISTS "Competitor_projectId_handle_key";
EXCEPTION WHEN undefined_object THEN NULL; END $$;

DROP INDEX IF EXISTS "Competitor_projectId_handle_key";

CREATE UNIQUE INDEX IF NOT EXISTS "Competitor_projectId_slug_key"
  ON "Competitor"("projectId", "slug");
CREATE INDEX IF NOT EXISTS "Competitor_projectId_handle_idx"
  ON "Competitor"("projectId", "handle");

-- ── CompetitorPost enrichments ───────────────────────────────────────
ALTER TABLE "CompetitorPost" ADD COLUMN IF NOT EXISTS "hashtagsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "CompetitorPost" ADD COLUMN IF NOT EXISTS "hourUtc" INTEGER;
CREATE INDEX IF NOT EXISTS "CompetitorPost_competitorId_publishedAt_idx"
  ON "CompetitorPost"("competitorId", "publishedAt");

-- ── New intelligence tables ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "CompetitorObservation" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    CONSTRAINT "CompetitorObservation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompetitorSnapshot" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "followers" INTEGER NOT NULL DEFAULT 0,
    "posts7d" INTEGER NOT NULL DEFAULT 0,
    "posts30d" INTEGER NOT NULL DEFAULT 0,
    "avgViews" INTEGER NOT NULL DEFAULT 0,
    "topHashtagsJson" TEXT NOT NULL DEFAULT '[]',
    "postingHoursJson" TEXT NOT NULL DEFAULT '{}',
    "appRating" DOUBLE PRECISION,
    "adCreativeCount" INTEGER NOT NULL DEFAULT 0,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompetitorAsset" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'thumbnail',
    "url" TEXT NOT NULL DEFAULT '',
    "externalId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorAsset_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CompetitorVersion" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL DEFAULT '',
    "summary" TEXT NOT NULL DEFAULT '',
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "screenshotUrl" TEXT NOT NULL DEFAULT '',
    "htmlPath" TEXT NOT NULL DEFAULT '',
    "changesJson" TEXT NOT NULL DEFAULT '[]',
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompetitorVersion_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "HookRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "competitorId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'tiktok',
    "externalId" TEXT NOT NULL DEFAULT '',
    "hook" TEXT NOT NULL,
    "topic" TEXT NOT NULL DEFAULT '',
    "emotion" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "structure" TEXT NOT NULL DEFAULT '',
    "openingSentence" TEXT NOT NULL DEFAULT '',
    "visualStyle" TEXT NOT NULL DEFAULT '',
    "colourPalette" TEXT NOT NULL DEFAULT '',
    "slides" INTEGER NOT NULL DEFAULT 0,
    "estimatedEngagement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "coverUrl" TEXT NOT NULL DEFAULT '',
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "HookRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "CreativeRecord" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "competitorId" TEXT,
    "source" TEXT NOT NULL DEFAULT 'tiktok',
    "kind" TEXT NOT NULL DEFAULT 'image',
    "externalId" TEXT NOT NULL DEFAULT '',
    "title" TEXT NOT NULL DEFAULT '',
    "hook" TEXT NOT NULL DEFAULT '',
    "cta" TEXT NOT NULL DEFAULT '',
    "copy" TEXT NOT NULL DEFAULT '',
    "colourPalette" TEXT NOT NULL DEFAULT '',
    "mediaUrl" TEXT NOT NULL DEFAULT '',
    "landingUrl" TEXT NOT NULL DEFAULT '',
    "platformsJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'active',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CreativeRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "IntelSyncJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "competitorId" TEXT,
    "cadence" TEXT NOT NULL DEFAULT 'manual',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "providersJson" TEXT NOT NULL DEFAULT '[]',
    "resultJson" TEXT NOT NULL DEFAULT '{}',
    "error" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IntelSyncJob_pkey" PRIMARY KEY ("id")
);

-- ── Indexes ──────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS "CompetitorObservation_competitorId_provider_observedAt_idx"
  ON "CompetitorObservation"("competitorId", "provider", "observedAt");
CREATE INDEX IF NOT EXISTS "CompetitorSnapshot_competitorId_date_idx"
  ON "CompetitorSnapshot"("competitorId", "date");
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorSnapshot_competitorId_date_key"
  ON "CompetitorSnapshot"("competitorId", "date");
CREATE INDEX IF NOT EXISTS "CompetitorAsset_competitorId_kind_idx"
  ON "CompetitorAsset"("competitorId", "kind");
CREATE UNIQUE INDEX IF NOT EXISTS "CompetitorAsset_competitorId_kind_externalId_key"
  ON "CompetitorAsset"("competitorId", "kind", "externalId");
CREATE INDEX IF NOT EXISTS "CompetitorVersion_competitorId_provider_observedAt_idx"
  ON "CompetitorVersion"("competitorId", "provider", "observedAt");
CREATE INDEX IF NOT EXISTS "CompetitorVersion_competitorId_fingerprint_idx"
  ON "CompetitorVersion"("competitorId", "fingerprint");
CREATE INDEX IF NOT EXISTS "HookRecord_projectId_views_idx" ON "HookRecord"("projectId", "views");
CREATE INDEX IF NOT EXISTS "HookRecord_projectId_topic_idx" ON "HookRecord"("projectId", "topic");
CREATE INDEX IF NOT EXISTS "HookRecord_projectId_emotion_idx" ON "HookRecord"("projectId", "emotion");
CREATE UNIQUE INDEX IF NOT EXISTS "HookRecord_projectId_source_externalId_hook_key"
  ON "HookRecord"("projectId", "source", "externalId", "hook");
CREATE UNIQUE INDEX IF NOT EXISTS "CreativeRecord_projectId_source_externalId_key"
  ON "CreativeRecord"("projectId", "source", "externalId");
CREATE INDEX IF NOT EXISTS "CreativeRecord_projectId_source_idx" ON "CreativeRecord"("projectId", "source");
CREATE INDEX IF NOT EXISTS "CreativeRecord_projectId_hook_idx" ON "CreativeRecord"("projectId", "hook");
CREATE INDEX IF NOT EXISTS "CreativeRecord_competitorId_idx" ON "CreativeRecord"("competitorId");
CREATE INDEX IF NOT EXISTS "IntelSyncJob_projectId_status_createdAt_idx"
  ON "IntelSyncJob"("projectId", "status", "createdAt");
CREATE INDEX IF NOT EXISTS "IntelSyncJob_competitorId_createdAt_idx"
  ON "IntelSyncJob"("competitorId", "createdAt");

-- ── Foreign keys (ignore if already present) ─────────────────────────
DO $$ BEGIN
  ALTER TABLE "CompetitorObservation"
    ADD CONSTRAINT "CompetitorObservation_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitorSnapshot"
    ADD CONSTRAINT "CompetitorSnapshot_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitorAsset"
    ADD CONSTRAINT "CompetitorAsset_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CompetitorVersion"
    ADD CONSTRAINT "CompetitorVersion_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "HookRecord"
    ADD CONSTRAINT "HookRecord_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "HookRecord"
    ADD CONSTRAINT "HookRecord_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CreativeRecord"
    ADD CONSTRAINT "CreativeRecord_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "CreativeRecord"
    ADD CONSTRAINT "CreativeRecord_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "IntelSyncJob"
    ADD CONSTRAINT "IntelSyncJob_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "IntelSyncJob"
    ADD CONSTRAINT "IntelSyncJob_competitorId_fkey"
    FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
