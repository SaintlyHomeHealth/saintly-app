-- Employee Handbook Acknowledgement signature metadata for Step 3 portal form.
alter table onboarding_contracts
  add column if not exists handbook_full_name text,
  add column if not exists handbook_signed_at timestamptz;
