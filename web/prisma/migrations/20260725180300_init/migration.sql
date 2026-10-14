-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "color" TEXT NOT NULL DEFAULT 'oklch(0.72 0.12 160)',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ConnectedAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "platform" TEXT NOT NULL DEFAULT 'tiktok',
    "username" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '',
    "followers" INTEGER NOT NULL DEFAULT 0,
    "lastSyncAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "rawProfile" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConnectedAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SyncLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'running',
    "stepsJson" TEXT NOT NULL DEFAULT '[]',
    "error" TEXT,
    "rawResponse" TEXT,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "SyncLog_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "accountId" TEXT,
    "externalId" TEXT,
    "hook" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "slidesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "theme" TEXT NOT NULL DEFAULT '',
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "saves" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "ctr" REAL NOT NULL DEFAULT 0,
    "publishedAt" DATETIME,
    "scheduledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DailyMetric" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "views" INTEGER NOT NULL DEFAULT 0,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "comments" INTEGER NOT NULL DEFAULT 0,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "followers" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "DailyMetric_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Experiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hypothesis" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'running',
    "posts" INTEGER NOT NULL DEFAULT 0,
    "winner" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0,
    "lift" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Experiment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Finding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "projectId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "kind" TEXT NOT NULL DEFAULT 'chat',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "attachmentsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Setting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    CONSTRAINT "Setting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    "detail" TEXT,
    "error" TEXT
);

-- CreateTable
CREATE TABLE "DevLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "level" TEXT NOT NULL DEFAULT 'info',
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "LibraryAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "tagsJson" TEXT NOT NULL DEFAULT '[]',
    "tone" TEXT NOT NULL DEFAULT '',
    "uses" INTEGER NOT NULL DEFAULT 0,
    "avgViews" INTEGER NOT NULL DEFAULT 0,
    "path" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "niche" TEXT NOT NULL DEFAULT '',
    "avgViews" INTEGER NOT NULL DEFAULT 0,
    "topHook" TEXT NOT NULL DEFAULT '',
    "postingFreq" TEXT NOT NULL DEFAULT '',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Competitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "QueueItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "postId" TEXT,
    "day" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "hook" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "QueueItem_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Project_workspaceId_slug_key" ON "Project"("workspaceId", "slug");

-- CreateIndex
CREATE INDEX "ConnectedAccount_projectId_idx" ON "ConnectedAccount"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "ConnectedAccount_projectId_platform_username_key" ON "ConnectedAccount"("projectId", "platform", "username");

-- CreateIndex
CREATE INDEX "SyncLog_accountId_startedAt_idx" ON "SyncLog"("accountId", "startedAt");

-- CreateIndex
CREATE INDEX "Post_projectId_status_idx" ON "Post"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DailyMetric_projectId_date_key" ON "DailyMetric"("projectId", "date");

-- CreateIndex
CREATE INDEX "Experiment_projectId_idx" ON "Experiment"("projectId");

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
CREATE INDEX "LibraryAsset_projectId_idx" ON "LibraryAsset"("projectId");

-- CreateIndex
CREATE INDEX "Competitor_projectId_idx" ON "Competitor"("projectId");

-- CreateIndex
CREATE INDEX "QueueItem_projectId_idx" ON "QueueItem"("projectId");
