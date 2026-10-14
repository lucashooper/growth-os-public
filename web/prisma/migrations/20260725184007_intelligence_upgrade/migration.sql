-- CreateTable
CREATE TABLE "CompetitorPost" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "publishedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompetitorPost_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Competitor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "handle" TEXT NOT NULL,
    "niche" TEXT NOT NULL DEFAULT '',
    "avatar" TEXT NOT NULL DEFAULT '',
    "bio" TEXT NOT NULL DEFAULT '',
    "followers" INTEGER NOT NULL DEFAULT 0,
    "hearts" INTEGER NOT NULL DEFAULT 0,
    "videoCount" INTEGER NOT NULL DEFAULT 0,
    "secUid" TEXT NOT NULL DEFAULT '',
    "avgViews" INTEGER NOT NULL DEFAULT 0,
    "topHook" TEXT NOT NULL DEFAULT '',
    "postingFreq" TEXT NOT NULL DEFAULT '',
    "lastSyncAt" DATETIME,
    "lastError" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Competitor_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Competitor" ("avgViews", "createdAt", "handle", "id", "niche", "postingFreq", "projectId", "topHook") SELECT "avgViews", "createdAt", "handle", "id", "niche", "postingFreq", "projectId", "topHook" FROM "Competitor";
DROP TABLE "Competitor";
ALTER TABLE "new_Competitor" RENAME TO "Competitor";
CREATE INDEX "Competitor_projectId_idx" ON "Competitor"("projectId");
CREATE UNIQUE INDEX "Competitor_projectId_handle_key" ON "Competitor"("projectId", "handle");
CREATE TABLE "new_Experiment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'manual',
    "hypothesis" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'running',
    "posts" INTEGER NOT NULL DEFAULT 0,
    "winner" TEXT,
    "confidence" REAL NOT NULL DEFAULT 0,
    "lift" REAL NOT NULL DEFAULT 0,
    "armsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Experiment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Experiment" ("confidence", "createdAt", "hypothesis", "id", "lift", "name", "posts", "projectId", "status", "updatedAt", "winner") SELECT "confidence", "createdAt", "hypothesis", "id", "lift", "name", "posts", "projectId", "status", "updatedAt", "winner" FROM "Experiment";
DROP TABLE "Experiment";
ALTER TABLE "new_Experiment" RENAME TO "Experiment";
CREATE INDEX "Experiment_projectId_idx" ON "Experiment"("projectId");
CREATE UNIQUE INDEX "Experiment_projectId_name_key" ON "Experiment"("projectId", "name");
CREATE TABLE "new_Finding" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'info',
    "text" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'agent',
    "metaJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Finding_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Finding" ("createdAt", "id", "projectId", "severity", "source", "text") SELECT "createdAt", "id", "projectId", "severity", "source", "text" FROM "Finding";
DROP TABLE "Finding";
ALTER TABLE "new_Finding" RENAME TO "Finding";
CREATE INDEX "Finding_projectId_createdAt_idx" ON "Finding"("projectId", "createdAt");
CREATE TABLE "new_LibraryAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LibraryAsset_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LibraryAsset_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LibraryAsset" ("avgViews", "createdAt", "id", "path", "projectId", "tagsJson", "theme", "tone", "uses") SELECT "avgViews", "createdAt", "id", "path", "projectId", "tagsJson", "theme", "tone", "uses" FROM "LibraryAsset";
DROP TABLE "LibraryAsset";
ALTER TABLE "new_LibraryAsset" RENAME TO "LibraryAsset";
CREATE INDEX "LibraryAsset_projectId_folder_idx" ON "LibraryAsset"("projectId", "folder");
CREATE INDEX "LibraryAsset_projectId_kind_idx" ON "LibraryAsset"("projectId", "kind");
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "ctr" REAL NOT NULL DEFAULT 0,
    "publishedAt" DATETIME,
    "scheduledAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Post_experimentId_fkey" FOREIGN KEY ("experimentId") REFERENCES "Experiment" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("accountId", "caption", "comments", "coverUrl", "createdAt", "ctr", "downloads", "externalId", "hook", "id", "likes", "projectId", "publishedAt", "saves", "scheduledAt", "shareUrl", "shares", "slidesJson", "status", "theme", "updatedAt", "views") SELECT "accountId", "caption", "comments", "coverUrl", "createdAt", "ctr", "downloads", "externalId", "hook", "id", "likes", "projectId", "publishedAt", "saves", "scheduledAt", "shareUrl", "shares", "slidesJson", "status", "theme", "updatedAt", "views" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE INDEX "Post_projectId_status_idx" ON "Post"("projectId", "status");
CREATE INDEX "Post_experimentId_idx" ON "Post"("experimentId");
CREATE UNIQUE INDEX "Post_accountId_externalId_key" ON "Post"("accountId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CompetitorPost_competitorId_views_idx" ON "CompetitorPost"("competitorId", "views");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitorPost_competitorId_externalId_key" ON "CompetitorPost"("competitorId", "externalId");
