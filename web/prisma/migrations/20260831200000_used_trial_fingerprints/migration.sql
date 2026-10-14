-- Card fingerprints that already claimed a free trial (anti-abuse)
CREATE TABLE IF NOT EXISTS "UsedTrialFingerprint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cardFingerprint" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL DEFAULT '',
    "stripeCustomerId" TEXT NOT NULL DEFAULT '',
    "lastUsedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "UsedTrialFingerprint_cardFingerprint_key"
  ON "UsedTrialFingerprint"("cardFingerprint");
CREATE INDEX IF NOT EXISTS "UsedTrialFingerprint_userId_idx"
  ON "UsedTrialFingerprint"("userId");
CREATE INDEX IF NOT EXISTS "UsedTrialFingerprint_lastUsedAt_idx"
  ON "UsedTrialFingerprint"("lastUsedAt");
