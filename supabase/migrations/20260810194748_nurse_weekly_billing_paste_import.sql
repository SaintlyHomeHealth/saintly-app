-- Paste-import payroll: fingerprint for double-pay prevention + source audit.

alter table public.nurse_weekly_billing_lines
  add column if not exists import_fingerprint text,
  add column if not exists source text;

alter table public.nurse_weekly_billing_lines
  drop constraint if exists nurse_weekly_billing_lines_source_check;

alter table public.nurse_weekly_billing_lines
  add constraint nurse_weekly_billing_lines_source_check
  check (source is null or source in ('manual', 'paste_import'));

comment on column public.nurse_weekly_billing_lines.import_fingerprint is
  'Stable visit identity for paste import dedupe: employeeId|normalizedPatient|serviceDate|lineType';

comment on column public.nurse_weekly_billing_lines.source is
  'manual (default UI) or paste_import (admin EMR paste tool)';

create unique index if not exists nurse_weekly_billing_lines_import_fingerprint_uidx
  on public.nurse_weekly_billing_lines (import_fingerprint)
  where import_fingerprint is not null;
