-- Manual cleanup: resolve duplicate (applicant_id, effective_date) rows on public.employee_contracts.
-- Uses only guaranteed columns: id, applicant_id, effective_date, created_at, updated_at, is_current.
-- Run in Supabase SQL editor after reviewing diagnostics from the payroll safe-patch migration.
-- If payroll_visit_items.contract_id points at deleted rows, those FKs become NULL (ON DELETE SET NULL).

-- ---------------------------------------------------------------------------
-- 1) Preview: rows that would be removed (rn > 1)
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    applicant_id,
    effective_date,
    is_current,
    created_at,
    updated_at,
    row_number() OVER (
      PARTITION BY applicant_id, effective_date
      ORDER BY
        CASE WHEN is_current IS TRUE THEN 0 ELSE 1 END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.employee_contracts
)
SELECT *
FROM ranked
WHERE rn > 1
ORDER BY applicant_id, effective_date, rn;

-- ---------------------------------------------------------------------------
-- 2) Delete duplicates (keeps one row per applicant_id + effective_date)
-- ---------------------------------------------------------------------------
-- Uncomment to execute:
/*
BEGIN;

WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY applicant_id, effective_date
      ORDER BY
        CASE WHEN is_current IS TRUE THEN 0 ELSE 1 END,
        updated_at DESC NULLS LAST,
        created_at DESC NULLS LAST,
        id DESC
    ) AS rn
  FROM public.employee_contracts
)
DELETE FROM public.employee_contracts ec
USING ranked r
WHERE ec.id = r.id
  AND r.rn > 1;

COMMIT;
*/

-- ---------------------------------------------------------------------------
-- 3) After cleanup, create the unique index (if the payroll patch skipped it)
-- ---------------------------------------------------------------------------
-- CREATE UNIQUE INDEX IF NOT EXISTS employee_contracts_applicant_effective_unique
--   ON public.employee_contracts (applicant_id, effective_date);
