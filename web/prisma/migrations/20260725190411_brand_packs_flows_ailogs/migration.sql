-- CreateTable
CREATE TABLE "BrandPack" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "colorsJson" TEXT NOT NULL DEFAULT '{}',
    "fontsJson" TEXT NOT NULL DEFAULT '{}',
    "assetsJson" TEXT NOT NULL DEFAULT '[]',
    "previewCss" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandPack_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContentFlow" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "beatsJson" TEXT NOT NULL DEFAULT '[]',
    "slideCount" INTEGER NOT NULL DEFAULT 6,
    "avgEngagement" REAL NOT NULL DEFAULT 0,
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContentFlow_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "BrandPack_projectId_idx" ON "BrandPack"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "BrandPack_projectId_slug_key" ON "BrandPack"("projectId", "slug");

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
