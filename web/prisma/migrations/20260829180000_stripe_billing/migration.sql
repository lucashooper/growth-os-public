-- AlterTable (SQLite-compatible — Postgres also accepts plain ADD COLUMN)
ALTER TABLE "Workspace" ADD COLUMN "stripeCustomerId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "stripeSubscriptionId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN "subscriptionTier" TEXT DEFAULT 'free';
ALTER TABLE "Workspace" ADD COLUMN "subscriptionStatus" TEXT DEFAULT 'inactive';
ALTER TABLE "Workspace" ADD COLUMN "currentPeriodEnd" DATETIME;
