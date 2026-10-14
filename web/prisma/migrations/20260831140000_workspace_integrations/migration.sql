-- CreateTable (idempotent for SQLite + Postgres)
CREATE TABLE IF NOT EXISTS "WorkspaceIntegration" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceIntegration_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WorkspaceIntegration_workspaceId_provider_key" ON "WorkspaceIntegration"("workspaceId", "provider");
CREATE INDEX IF NOT EXISTS "WorkspaceIntegration_workspaceId_idx" ON "WorkspaceIntegration"("workspaceId");
