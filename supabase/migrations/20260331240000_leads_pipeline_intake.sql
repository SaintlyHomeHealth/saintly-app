-- Lead pipeline: expanded referral / doctor office intake; patient parity for convert.

alter table public.leads
  add column if not exists referring_doctor_name text,
  add column if not exists doctor_office_name text,
  add column if not exists doctor_office_phone text,
  add column if not exists doctor_office_fax text,
  add column if not exists doctor_office_contact_person text;

comment on column public.leads.referring_doctor_name is 'Treating / referring physician name (distinct from agency referral source).';
comment on column public.leads.doctor_office_name is 'Referring practice or clinic name.';

alter table public.patients
  add column if not exists referring_doctor_name text,
  add column if not exists doctor_office_name text,
  add column if not exists doctor_office_phone text,
  add column if not exists doctor_office_fax text,
  add column if not exists doctor_office_contact_person text;

-- Widen lead source for manual / walk-in entry (app still validates).
alter table public.leads
  drop constraint if exists leads_source_check;

alter table public.leads
  add constraint leads_source_check
  check (
    source in (
      'phone',
      'facebook',
      'google',
      'hospital',
      'other',
      'manual',
      'walk_in',
      'referral'
    )
  );
