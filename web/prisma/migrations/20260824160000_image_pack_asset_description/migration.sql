-- AlterTable (SQLite-compatible — no IF NOT EXISTS on ADD COLUMN)
ALTER TABLE "ImagePackAsset" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
