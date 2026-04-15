-- Work setting (structured eligibility) + auto insurance storage path for field staff.

alter table public.applicants
  add column if not exists work_setting text;

alter table public.applicants
  add column if not exists auto_insurance_file text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'applicants_work_setting_check'
  ) then
    alter table public.applicants
      add constraint applicants_work_setting_check
      check (work_setting is null or work_setting in ('field', 'office', 'both'));
  end if;
end $$;

comment on column public.applicants.work_setting is
  'Where the applicant works: field (home visits), office (administrative), or both.';

comment on column public.applicants.auto_insurance_file is
  'Storage path in applicant-files bucket for auto insurance proof (field / both roles).';
