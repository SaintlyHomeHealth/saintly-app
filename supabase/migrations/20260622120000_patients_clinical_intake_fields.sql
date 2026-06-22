-- Patient chart clinical / insurance intake fields (home health CRM; not clinical EMR).

alter table public.patients
  add column if not exists medicare_number text,
  add column if not exists medicaid_id text,
  add column if not exists diagnosis_text text,
  add column if not exists diagnosis_code text,
  add column if not exists referral_source_phone text,
  add column if not exists referral_received_at timestamptz;

comment on column public.patients.medicare_number is 'Medicare Beneficiary Identifier (MBI) or legacy HICN.';
comment on column public.patients.medicaid_id is 'Medicaid / AHCCCS member ID when applicable.';
comment on column public.patients.diagnosis_text is 'Primary diagnosis or chief complaint from intake.';
comment on column public.patients.diagnosis_code is 'ICD-10 code from intake when available.';
comment on column public.patients.referral_source_phone is 'Phone for the referring source (facility, agency, etc.).';
comment on column public.patients.referral_received_at is 'When the referral was received.';

create index if not exists patients_medicare_number_trgm_idx
  on public.patients using gin (lower(medicare_number) gin_trgm_ops)
  where medicare_number is not null;

create index if not exists patients_medicaid_id_trgm_idx
  on public.patients using gin (lower(medicaid_id) gin_trgm_ops)
  where medicaid_id is not null;
