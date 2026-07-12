-- Prevent duplicate generated commitment instances for the same template and month.
--
-- Safety preflight for deployments that already contain duplicate generated
-- commitments from the previous auto-generation bug:
-- - Manual commitments are not touched because templateId IS NULL.
-- - For generated duplicates, keep the deterministic oldest row per
--   (templateId, anio, mes), ordered by createdAt then id.
-- - Delete only the extra generated rows before creating the unique index.
--
-- Existing generated duplicates are data corruption: preserving a single stable
-- row is lower-risk than failing the migration and leaving future generation
-- unprotected.
WITH ranked_generated_commitments AS (
  SELECT
    "id",
    ROW_NUMBER() OVER (
      PARTITION BY "templateId", "anio", "mes"
      ORDER BY "createdAt" ASC, "id" ASC
    ) AS duplicate_rank
  FROM "commitments"
  WHERE "templateId" IS NOT NULL
)
DELETE FROM "commitments"
WHERE "id" IN (
  SELECT "id"
  FROM ranked_generated_commitments
  WHERE duplicate_rank > 1
);

-- PostgreSQL unique indexes allow multiple NULL values, so manual commitments
-- without a templateId remain unrestricted.
CREATE UNIQUE INDEX "commitments_templateId_anio_mes_key" ON "commitments"("templateId", "anio", "mes");
