-- Phase 1: introduce Handbook model and Session.activeHandbookId.
-- NOTE:
-- 1) Apply after deploying code that contains the updated Prisma schema.
-- 2) Run backfill script afterwards: npm run backfill:handbooks

BEGIN;

CREATE TABLE IF NOT EXISTS "Handbook" (
  "id" TEXT NOT NULL,
  "sessionId" TEXT NOT NULL,
  "title" TEXT NOT NULL DEFAULT 'Untitled Handbook',
  "html" TEXT NOT NULL,
  "lifecycle" "HandbookLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
  "publishedAt" TIMESTAMP(3),
  "archivedAt" TIMESTAMP(3),
  "generatedAt" TIMESTAMP(3),
  "sourceContext" JSONB,
  "sourceBlocks" JSONB,
  "sourceSpotBlocks" JSONB,
  "sourceToolOutputs" JSONB,
  "previewPath" TEXT,
  "style" TEXT,
  "thumbnailUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Handbook_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "activeHandbookId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Handbook_sessionId_fkey'
  ) THEN
    ALTER TABLE "Handbook"
      ADD CONSTRAINT "Handbook_sessionId_fkey"
      FOREIGN KEY ("sessionId") REFERENCES "Session"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'Session_activeHandbookId_fkey'
  ) THEN
    ALTER TABLE "Session"
      ADD CONSTRAINT "Session_activeHandbookId_fkey"
      FOREIGN KEY ("activeHandbookId") REFERENCES "Handbook"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Session_activeHandbookId_idx"
  ON "Session"("activeHandbookId");

CREATE INDEX IF NOT EXISTS "Handbook_sessionId_updatedAt_idx"
  ON "Handbook"("sessionId", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "Handbook_sessionId_lifecycle_updatedAt_idx"
  ON "Handbook"("sessionId", "lifecycle", "updatedAt" DESC);

CREATE INDEX IF NOT EXISTS "Handbook_lifecycle_publishedAt_idx"
  ON "Handbook"("lifecycle", "publishedAt" DESC);

COMMIT;
