-- Structured payer labels remain in app config; DB stores selected label on patients.payer_name.
-- Service disciplines: native text[] on patients (and leads for intake parity).
-- Staff: extend patient_assignments with clinical discipline + primary flag; add clinician role.

alter table public.patients
  add column if not exists service_disciplines text[] not null default '{}';

comment on column public.patients.service_disciplines is 'Ordered set of service line codes (RN, PT, OT, ST, MSW, HHA, LPN). Legacy service_type may mirror a joined summary.';

alter table public.leads
  add column if not exists service_disciplines text[] not null default '{}';

-- Backfill from legacy single text (single value → one-element array)
update public.patients
set service_disciplines = array[trim(service_type)]::text[]
where service_type is not null
  and trim(service_type) <> ''
  and cardinality(service_disciplines) = 0;

update public.leads
set service_disciplines = array[trim(service_type)]::text[]
where service_type is not null
  and trim(service_type) <> ''
  and cardinality(service_disciplines) = 0;

alter table public.patient_assignments
  add column if not exists discipline text,
  add column if not exists is_primary boolean not null default false;

comment on column public.patient_assignments.discipline is 'Clinical line when role = clinician (RN, PT, OT, ST, MSW, HHA, LPN). Null for operational roles.';
comment on column public.patient_assignments.is_primary is 'Primary clinician for that discipline when role = clinician; primary nurse is indicated by role = primary_nurse.';

alter table public.patient_assignments
  drop constraint if exists patient_assignments_role_check;

alter table public.patient_assignments
  add constraint patient_assignments_role_check
  check (role in ('primary_nurse', 'backup_nurse', 'intake', 'admin', 'clinician'));

alter table public.patient_assignments
  add constraint patient_assignments_discipline_check
  check (
    (role = 'clinician' and discipline is not null and discipline in ('RN', 'PT', 'OT', 'ST', 'MSW', 'HHA', 'LPN'))
    or
    (role <> 'clinician' and discipline is null)
  );
