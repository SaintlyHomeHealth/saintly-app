-- CPR/BLS expiration is distinct from professional license expiration for compliance tracking.

alter table public.applicants
  add column if not exists cpr_expiration_date date;

comment on column public.applicants.cpr_expiration_date is
  'CPR/BLS certification expiration when cpr_bls_status is active.';
