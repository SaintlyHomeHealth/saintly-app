create table if not exists public.employee_tax_forms (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  form_type text not null check (form_type in ('w4', 'w9')),
  form_status text not null default 'draft' check (form_status in ('draft', 'sent', 'completed', 'void')),
  employment_classification text not null check (employment_classification in ('employee', 'contractor')),
  form_data jsonb not null default '{}'::jsonb,
  admin_sent_by text,
  admin_sent_at timestamptz,
  employee_signed_name text,
  employee_signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_tax_forms_applicant_form_type_unique unique (applicant_id, form_type)
);

create index if not exists employee_tax_forms_applicant_idx
  on public.employee_tax_forms (applicant_id);

create index if not exists employee_tax_forms_status_idx
  on public.employee_tax_forms (form_status);

create index if not exists employee_tax_forms_sent_at_idx
  on public.employee_tax_forms (admin_sent_at desc);
