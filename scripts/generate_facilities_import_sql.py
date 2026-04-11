#!/usr/bin/env python3
"""Generate facilities_import.sql and migration from arizona_facilities_crm_clean.csv."""

from __future__ import annotations

import csv
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CSV_PATH = ROOT / "arizona_facilities_crm_clean.csv"
MIGRATION_PATH = ROOT / "supabase" / "migrations" / "20260411180000_import_arizona_facilities_csv.sql"
IMPORT_PATH = ROOT / "facilities_import.sql"

HEADER = """-- Arizona facilities CSV import -> public.facilities (CRM)
-- Source CSV columns map to DB columns as follows:
--   "Business Name" -> name
--   "Address"       -> address_line_1 (full address line; CRM has no single "address" column)
--   "Phone Number"  -> main_phone
--   "Facility Type" -> "type" (quoted; reserved word)
--   "Priority"      -> priority
-- status defaults to 'New' (matches existing CRM seed); created_at / updated_at set to now().
--
-- Prerequisite: public.facilities from supabase/migrations/20260409120000_facilities_crm.sql
--
-- Dedupe: NOT EXISTS on lower(trim(name)) + lower(trim(address_line_1)) (same pattern as
--   20260409140000_seed_facilities_maricopa_snfs.sql). No unique constraint required.
--
-- Optional ON CONFLICT path (only if you add a unique index first and verify no collisions):
--   CREATE UNIQUE INDEX facilities_import_dedupe_idx ON public.facilities (
--     (md5(lower(trim(name)) || '|' || lower(trim(coalesce(address_line_1, ''))))));
--   Then use INSERT ... ON CONFLICT ON CONSTRAINT facilities_import_dedupe_idx DO NOTHING;
--   (Not used here to avoid migration failures when legacy duplicates exist.)
--
-- If public.facilities is missing: run 20260409120000_facilities_crm.sql (recommended), or
-- create a compatible table; this file targets the CRM column layout (not a minimal name/address/phone only table).
--
-- RLS: SQL Editor / service role typically bypasses RLS; app users need manager|admin|super_admin per facilities policies.
"""


def esc(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def main() -> None:
    rows: list[tuple[str, str, str, str, str]] = []
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            name = row.get("Business Name") or ""
            addr = row.get("Address") or ""
            phone = row.get("Phone Number") or ""
            ftype = row.get("Facility Type") or ""
            pri = row.get("Priority") or ""
            rows.append((name, addr, phone, ftype, pri))

    # Build VALUES lines (max ~500 rows per INSERT to avoid huge statements if needed)
    chunk_size = 500
    chunks: list[list[tuple[str, str, str, str, str]]] = []
    for i in range(0, len(rows), chunk_size):
        chunks.append(rows[i : i + chunk_size])

    body_parts: list[str] = []
    for chunk in chunks:
        vals = []
        for name, addr, phone, ftype, pri in chunk:
            vals.append(
                f"({esc(name)}, {esc(addr)}, {esc(phone)}, {esc(ftype)}, {esc(pri)})"
            )
        values_sql = ",\n    ".join(vals)
        body_parts.append(
            f"""INSERT INTO public.facilities (
  name,
  address_line_1,
  main_phone,
  "type",
  priority,
  status,
  created_at,
  updated_at,
  is_active
)
SELECT
  t.name,
  t.address_line_1,
  t.main_phone,
  t.facility_type,
  t.priority,
  'New',
  now(),
  now(),
  true
FROM (
  VALUES
    {values_sql}
) AS t(name, address_line_1, main_phone, facility_type, priority)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.facilities f
  WHERE lower(trim(f.name)) = lower(trim(t.name))
    AND lower(trim(coalesce(f.address_line_1, ''))) = lower(trim(coalesce(t.address_line_1, '')))
);"""
        )

    full_sql = HEADER + "\n\n".join(body_parts) + "\n"

    MIGRATION_PATH.parent.mkdir(parents=True, exist_ok=True)
    MIGRATION_PATH.write_text(full_sql, encoding="utf-8")
    IMPORT_PATH.write_text(full_sql, encoding="utf-8")
    print(f"Wrote {len(rows)} rows to {MIGRATION_PATH} and {IMPORT_PATH}")


if __name__ == "__main__":
    main()
