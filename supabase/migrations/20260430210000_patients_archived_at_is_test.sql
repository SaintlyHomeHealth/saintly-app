-- Soft-archive patients (hide from default lists) + optional test cohort flag — no hard deletes here.

alter table public.patients
  add column if not exists archived_at timestamptz;

alter table public.patients
  add column if not exists is_test boolean not null default false;

comment on column public.patients.archived_at is
  'When set, patient is hidden from default CRM/workspace patient pickers; FK children unchanged.';

comment on column public.patients.is_test is
  'Ops/testing cohort — filter in admin CRM to separate from production charts.';

create index if not exists patients_created_at_active_idx
  on public.patients (created_at desc)
  where archived_at is null;

create index if not exists patients_is_test_idx
  on public.patients (is_test)
  where is_test = true;
