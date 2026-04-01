begin;

alter table public.employee_tax_forms
  drop constraint if exists employee_tax_forms_applicant_form_type_unique;

alter table public.employee_tax_forms
  add column if not exists version_number integer,
  add column if not exists is_current boolean,
  add column if not exists superseded_form_id uuid references public.employee_tax_forms(id) on delete set null;

update public.employee_tax_forms
set version_number = 1
where version_number is null;

update public.employee_tax_forms
set is_current = true
where is_current is null;

alter table public.employee_tax_forms
  alter column version_number set default 1,
  alter column version_number set not null,
  alter column is_current set default true,
  alter column is_current set not null;

alter table public.employee_tax_forms
  drop constraint if exists employee_tax_forms_form_status_check;

alter table public.employee_tax_forms
  add constraint employee_tax_forms_form_status_check
  check (form_status in ('draft', 'sent', 'completed', 'superseded', 'void'));

drop index if exists employee_tax_forms_applicant_idx;
create index if not exists employee_tax_forms_applicant_idx
  on public.employee_tax_forms (applicant_id);

create unique index if not exists employee_tax_forms_one_current_per_applicant_idx
  on public.employee_tax_forms (applicant_id)
  where is_current = true;

create index if not exists employee_tax_forms_history_idx
  on public.employee_tax_forms (applicant_id, version_number desc, created_at desc);

commit;
