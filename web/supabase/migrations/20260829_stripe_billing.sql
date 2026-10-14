-- Growth OS Stripe billing columns
-- Prisma model: Workspace (quoted camelCase, same as the rest of the app)
ALTER TABLE public."Workspace"
  ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT,
  ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionTier" TEXT DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS "subscriptionStatus" TEXT DEFAULT 'inactive',
  ADD COLUMN IF NOT EXISTS "currentPeriodEnd" TIMESTAMP(3);
