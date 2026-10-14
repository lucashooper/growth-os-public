-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ConnectedAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "lastSyncAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'active',
    "lastError" TEXT,
    "rawProfile" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ConnectedAccount_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ConnectedAccount" ("avatar", "createdAt", "followers", "id", "lastError", "lastSyncAt", "nickname", "platform", "projectId", "rawProfile", "status", "updatedAt", "username") SELECT "avatar", "createdAt", "followers", "id", "lastError", "lastSyncAt", "nickname", "platform", "projectId", "rawProfile", "status", "updatedAt", "username" FROM "ConnectedAccount";
DROP TABLE "ConnectedAccount";
ALTER TABLE "new_ConnectedAccount" RENAME TO "ConnectedAccount";
CREATE INDEX "ConnectedAccount_projectId_idx" ON "ConnectedAccount"("projectId");
CREATE UNIQUE INDEX "ConnectedAccount_projectId_platform_username_key" ON "ConnectedAccount"("projectId", "platform", "username");
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "accountId" TEXT,
    "externalId" TEXT,
    "hook" TEXT NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "slidesJson" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "theme" TEXT NOT NULL DEFAULT '',
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
    CONSTRAINT "Post_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ConnectedAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("accountId", "caption", "comments", "createdAt", "ctr", "downloads", "externalId", "hook", "id", "likes", "projectId", "publishedAt", "saves", "scheduledAt", "slidesJson", "status", "theme", "updatedAt", "views") SELECT "accountId", "caption", "comments", "createdAt", "ctr", "downloads", "externalId", "hook", "id", "likes", "projectId", "publishedAt", "saves", "scheduledAt", "slidesJson", "status", "theme", "updatedAt", "views" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE INDEX "Post_projectId_status_idx" ON "Post"("projectId", "status");
CREATE UNIQUE INDEX "Post_accountId_externalId_key" ON "Post"("accountId", "externalId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
