-- Version history: allow multiple employee_contracts rows per applicant with the same
-- effective_date; uniqueness is (applicant_id, employment_classification, version_number).
-- employment_classification is the agreement type (W-2 vs contractor).

alter table public.employee_contracts
  add column if not exists version_number integer,
  add column if not exists is_current boolean default true;

-- Backfill version_number (per applicant + agreement type) and is_current (latest row per applicant).
with ranked as (
  select
    id,
    row_number() over (
      partition by applicant_id, employment_classification
      order by created_at asc nulls last, id asc
    ) as vn,
    row_number() over (
      partition by applicant_id
      order by created_at desc nulls last, id desc
    ) as recency
  from public.employee_contracts
)
update public.employee_contracts ec
set
  version_number = ranked.vn,
  is_current = (ranked.recency = 1)
from ranked
where ec.id = ranked.id;

update public.employee_contracts
set version_number = 1
where version_number is null;

alter table public.employee_contracts
  alter column version_number set not null,
  alter column version_number set default 1;

alter table public.employee_contracts
  alter column is_current set not null,
  alter column is_current set default true;

-- Old rule: one row per (applicant_id, effective_date).
drop index if exists public.employee_contracts_applicant_effective_unique;

alter table public.employee_contracts
  drop constraint if exists employee_contracts_applicant_effective_unique;

create unique index if not exists employee_contracts_applicant_agreement_version_unique
  on public.employee_contracts (applicant_id, employment_classification, version_number);

comment on index public.employee_contracts_applicant_agreement_version_unique is
  'One version number per applicant and agreement type (employment_classification); allows multiple effective_date revisions in history.';
