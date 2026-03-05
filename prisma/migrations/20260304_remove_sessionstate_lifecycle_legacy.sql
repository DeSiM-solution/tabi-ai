-- Remove legacy session-level handbook lifecycle fields.
-- Lifecycle is handbook-level and persisted on the Handbook table.

DROP INDEX IF EXISTS "SessionState_handbookLifecycle_updatedAt_idx";

ALTER TABLE "SessionState"
  DROP COLUMN IF EXISTS "handbookLifecycle",
  DROP COLUMN IF EXISTS "handbookPublishedAt",
  DROP COLUMN IF EXISTS "handbookArchivedAt";
