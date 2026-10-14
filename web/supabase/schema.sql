node.exe : warn The configuration property `package.json#prisma` is deprecated and will be removed in Prisma 7. Please 
migrate to a Prisma config file (e.g., `prisma.config.ts`).
At C:\Program Files\nodejs\npx.ps1:29 char:3
+   & $NODE_EXE $NPX_CLI_JS $args
+   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (warn The config...ma.config.ts`).:String) [], RemoteException
    + FullyQualifiedErrorId : NativeCommandError
 
For more information, see: https://pris.ly/prisma-config

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "avatarUrl" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'Owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemFlag" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemFlag_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'oklch(0.72 0.12 160)',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'tiktok',
    "username" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "followers" INTEGER NOT NULL DEFAULT 0,
    "following" INTEGER NOT NULL DEFAULT 0,
    "hearts" INTEGER NOT NULL DEFAULT 0,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "secUid" TEXT NOT NULL DEFAULT '',
    "openId" TEXT NOT NULL DEFAULT '',
    "accessToken" TEXT NOT NULL DEFAULT '',
    "refreshToken" TEXT NOT NULL DEFAULT '',
    "tokenExpiresAt" TIMESTAMP(3),
    "oauthScopes" TEXT NOT NULL DEFAULT '',
    "oauthConnectedAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "rawProfile" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConnectedAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishJob" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'tiktok',
    "postId" TEXT,
    "publishId" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "title" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "privacyLevel" TEXT NOT NULL DEFAULT '',
    "imageUrlsJson" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "stepsJson" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "rawResponse" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "SyncLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "accountId" TEXT,
    "experimentId" TEXT,
    "externalId" TEXT,
    "hook" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "slidesJson" TEXT NOT NULL DEFAULT '[]',
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "theme" TEXT NOT NULL DEFAULT '',
    "variantKey" TEXT NOT NULL DEFAULT '',
    "coverUrl" TEXT NOT NULL DEFAULT '',
    "shareUrl" TEXT NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "ctr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "DailyMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "hypothesis" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'running',
    "posts" INTEGER NOT NULL DEFAULT 0,
    "winner" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lift" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "armsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Experiment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Finding_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachmentsJson" TEXT NOT NULL DEFAULT '[]',
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "detail" TEXT,
    "error" TEXT,

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DevLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT 'info',
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DevLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LibraryAsset" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'image',
    "folder" TEXT NOT NULL DEFAULT '',
    "mime" TEXT NOT NULL DEFAULT '',
    "size" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT NOT NULL DEFAULT '',
    "path" TEXT NOT NULL DEFAULT '',
    "theme" TEXT NOT NULL DEFAULT '',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "tone" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'upload',
    "postId" TEXT,
    "uses" INTEGER NOT NULL DEFAULT 0,
    "avgViews" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LibraryAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'tiktok',
    "handle" TEXT NOT NULL DEFAULT '',
    "niche" TEXT NOT NULL DEFAULT '',
    "websiteUrl" TEXT NOT NULL DEFAULT '',
    "appStoreUrl" TEXT NOT NULL DEFAULT '',
    "playStoreUrl" TEXT NOT NULL DEFAULT '',
    "metaPageId" TEXT NOT NULL DEFAULT '',
    "instagram" TEXT NOT NULL DEFAULT '',
    "facebookPage" TEXT NOT NULL DEFAULT '',
    "twitter" TEXT NOT NULL DEFAULT '',
    "youtube" TEXT NOT NULL DEFAULT '',
    "syncCadence" TEXT NOT NULL DEFAULT 'manual',
    "nextSyncAt" TIMESTAMP(3),
    "avatar" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "followers" INTEGER NOT NULL DEFAULT 0,
    "hearts" INTEGER NOT NULL DEFAULT 0,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "secUid" TEXT NOT NULL DEFAULT '',
    "avgViews" INTEGER NOT NULL DEFAULT 0,
    "topHook" TEXT NOT NULL DEFAULT '',
    "postingFreq" TEXT NOT NULL DEFAULT '',
    "aiSummary" TEXT NOT NULL DEFAULT '',
    "aiSummaryAt" TIMESTAMP(3),
    "signalsJson" TEXT NOT NULL DEFAULT '{}',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorPost" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "hook" TEXT NOT NULL DEFAULT '',
    "caption" TEXT NOT NULL DEFAULT '',
    "coverUrl" TEXT NOT NULL DEFAULT '',
    "shareUrl" TEXT NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "shares" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "hashtagsJson" TEXT NOT NULL DEFAULT '[]',
    "hourUtc" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompetitorPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorObservation" (
    "id" TEXT NOT NULL,
    "competitorId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "observedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,

    CONSTRAINT "CompetitorObservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitorSnapshot" (
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

-- CreateTable
CREATE TABLE "CompetitorAsset" (
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

-- CreateTable
CREATE TABLE "CompetitorVersion" (
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

-- CreateTable
CREATE TABLE "HookRecord" (
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

-- CreateTable
CREATE TABLE "CreativeRecord" (
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

-- CreateTable
CREATE TABLE "IntelSyncJob" (
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

-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "postId" TEXT,
    "day" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QueueItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BrandPack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "colorsJson" TEXT NOT NULL DEFAULT '{}',
    "fontsJson" TEXT NOT NULL DEFAULT '{}',
    "assetsJson" TEXT NOT NULL DEFAULT '[]',
    "previewCss" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BrandPack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagePack" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "orderMode" TEXT NOT NULL DEFAULT 'ai',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImagePack_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImagePackAsset" (
    "id" TEXT NOT NULL,
    "packId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "kind" TEXT NOT NULL DEFAULT 'background',
    "url" TEXT NOT NULL,
    "path" TEXT NOT NULL DEFAULT '',
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImagePackAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentFlow" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "beatsJson" TEXT NOT NULL DEFAULT '[]',
    "slideCount" INTEGER NOT NULL DEFAULT 6,
    "avgEngagement" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContentFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiLog" (
    "id" TEXT NOT NULL,
    "projectId" TEXT,
    "action" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT '',
    "model" TEXT NOT NULL DEFAULT '',
    "promptJson" TEXT NOT NULL DEFAULT '[]',
    "responseText" TEXT NOT NULL DEFAULT '',
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "error" TEXT,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_slug_key" ON "Project"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "ConnectedAccount_projectId_idx" ON "ConnectedAccount"("projectId");

-- CreateIndex
CREATE INDEX "ConnectedAccount_openId_idx" ON "ConnectedAccount"("openId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_projectId_platform_username_key" ON "ConnectedAccount"("projectId", "platform", "username");

-- CreateIndex
CREATE INDEX "PublishJob_accountId_createdAt_idx" ON "PublishJob"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "PublishJob_projectId_status_idx" ON "PublishJob"("projectId", "status");

-- CreateIndex
CREATE INDEX "SyncLog_accountId_startedAt_idx" ON "SyncLog"("accountId", "startedAt");

-- CreateIndex
CREATE INDEX "Post_projectId_status_idx" ON "Post"("projectId", "status");

-- CreateIndex
CREATE INDEX "Post_experimentId_idx" ON "Post"("experimentId");

-- CreateIndex
CREATE UNIQUE INDEX "Post_accountId_externalId_key" ON "Post"("accountId", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_projectId_date_key" ON "DailyMetric"("projectId", "date");

-- CreateIndex
CREATE INDEX "Experiment_projectId_idx" ON "Experiment"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "Experiment_projectId_name_key" ON "Experiment"("projectId", "name");

-- CreateIndex
CREATE INDEX "Finding_projectId_createdAt_idx" ON "Finding"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "Conversation_workspaceId_updatedAt_idx" ON "Conversation"("workspaceId", "updatedAt");

-- CreateIndex
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Setting_workspaceId_key_key" ON "Setting"("workspaceId", "key");

-- CreateIndex
CREATE INDEX "JobRun_startedAt_idx" ON "JobRun"("startedAt");

-- CreateIndex
CREATE INDEX "DevLog_category_createdAt_idx" ON "DevLog"("category", "createdAt");

-- CreateIndex
CREATE INDEX "DevLog_level_createdAt_idx" ON "DevLog"("level", "createdAt");

-- CreateIndex
CREATE INDEX "LibraryAsset_projectId_folder_idx" ON "LibraryAsset"("projectId", "folder");

-- CreateIndex
CREATE INDEX "LibraryAsset_projectId_kind_idx" ON "LibraryAsset"("projectId", "kind");

-- CreateIndex
CREATE INDEX "Competitor_projectId_idx" ON "Competitor"("projectId");

-- CreateIndex
CREATE INDEX "Competitor_projectId_handle_idx" ON "Competitor"("projectId", "handle");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_projectId_slug_key" ON "Competitor"("projectId", "slug");

-- CreateIndex
CREATE INDEX "CompetitorPost_competitorId_views_idx" ON "CompetitorPost"("competitorId", "views");

-- CreateIndex
CREATE INDEX "CompetitorPost_competitorId_publishedAt_idx" ON "CompetitorPost"("competitorId", "publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorPost_competitorId_externalId_key" ON "CompetitorPost"("competitorId", "externalId");

-- CreateIndex
CREATE INDEX "CompetitorObservation_competitorId_provider_observedAt_idx" ON "CompetitorObservation"("competitorId", "provider", "observedAt");

-- CreateIndex
CREATE INDEX "CompetitorSnapshot_competitorId_date_idx" ON "CompetitorSnapshot"("competitorId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorSnapshot_competitorId_date_key" ON "CompetitorSnapshot"("competitorId", "date");

-- CreateIndex
CREATE INDEX "CompetitorAsset_competitorId_kind_idx" ON "CompetitorAsset"("competitorId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorAsset_competitorId_kind_externalId_key" ON "CompetitorAsset"("competitorId", "kind", "externalId");

-- CreateIndex
CREATE INDEX "QueueItem_projectId_idx" ON "QueueItem"("projectId");

-- CreateIndex
CREATE INDEX "BrandPack_projectId_idx" ON "BrandPack"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandPack_projectId_slug_key" ON "BrandPack"("projectId", "slug");

-- CreateIndex
CREATE INDEX "ImagePack_projectId_idx" ON "ImagePack"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ImagePack_projectId_slug_key" ON "ImagePack"("projectId", "slug");

-- CreateIndex
CREATE INDEX "ImagePackAsset_packId_sortOrder_idx" ON "ImagePackAsset"("packId", "sortOrder");

-- CreateIndex
CREATE INDEX "ContentFlow_projectId_idx" ON "ContentFlow"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ContentFlow_projectId_slug_key" ON "ContentFlow"("projectId", "slug");

-- CreateIndex
CREATE INDEX "AiLog_createdAt_idx" ON "AiLog"("createdAt");

-- CreateIndex
CREATE INDEX "AiLog_action_createdAt_idx" ON "AiLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AiLog_ok_createdAt_idx" ON "AiLog"("ok", "createdAt");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConnectedAccount" ADD CONSTRAINT "ConnectedAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishJob" ADD CONSTRAINT "PublishJob_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncLog" ADD CONSTRAINT "SyncLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyMetric" ADD CONSTRAINT "DailyMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Experiment" ADD CONSTRAINT "Experiment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Finding" ADD CONSTRAINT "Finding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Setting" ADD CONSTRAINT "Setting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryAsset" ADD CONSTRAINT "LibraryAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LibraryAsset" ADD CONSTRAINT "LibraryAsset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorPost" ADD CONSTRAINT "CompetitorPost_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorObservation" ADD CONSTRAINT "CompetitorObservation_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorSnapshot" ADD CONSTRAINT "CompetitorSnapshot_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitorAsset" ADD CONSTRAINT "CompetitorAsset_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QueueItem" ADD CONSTRAINT "QueueItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandPack" ADD CONSTRAINT "BrandPack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePack" ADD CONSTRAINT "ImagePack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImagePackAsset" ADD CONSTRAINT "ImagePackAsset_packId_fkey" FOREIGN KEY ("packId") REFERENCES "ImagePack"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentFlow" ADD CONSTRAINT "ContentFlow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

