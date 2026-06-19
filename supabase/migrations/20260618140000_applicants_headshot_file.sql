-- Professional headshot storage path (applicant-files bucket), parallel to auto_insurance_file.

alter table public.applicants
  add column if not exists headshot_file text;

comment on column public.applicants.headshot_file is
  'Storage path in applicant-files for the current professional headshot used for ID verification and employee badges.';
