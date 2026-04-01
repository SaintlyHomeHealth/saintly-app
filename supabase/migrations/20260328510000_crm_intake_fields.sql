-- Referral / payer intake for CRM leads and patients (Saintly ops layer; not clinical EMR).

alter table public.leads
  add column if not exists referring_provider_name text,
  add column if not exists referring_provider_phone text,
  add column if not exists payer_name text,
  add column if not exists payer_type text,
  add column if not exists referral_source text,
  add column if not exists service_type text,
  add column if not exists intake_status text;

alter table public.patients
  add column if not exists referring_provider_name text,
  add column if not exists referring_provider_phone text,
  add column if not exists payer_type text,
  add column if not exists referral_source text,
  add column if not exists service_type text,
  add column if not exists intake_status text;
