create table if not exists public.employee_contracts (
  id uuid primary key default gen_random_uuid(),
  applicant_id uuid not null references public.applicants(id) on delete cascade,
  role_key text not null check (role_key in ('rn', 'pt', 'st', 'msw', 'hha')),
  role_label text not null,
  employment_classification text not null check (employment_classification in ('employee', 'contractor')),
  employment_type text not null check (employment_type in ('prn', 'part_time', 'full_time')),
  pay_type text not null check (pay_type in ('per_visit', 'hourly', 'salary')),
  pay_rate numeric(10, 2) not null check (pay_rate >= 0),
  mileage_type text not null default 'none' check (mileage_type in ('none', 'per_mile')),
  mileage_rate numeric(10, 2),
  effective_date date not null,
  contract_status text not null default 'draft' check (contract_status in ('draft', 'sent', 'signed', 'void')),
  contract_text_snapshot text not null,
  admin_prepared_by text,
  admin_prepared_at timestamptz,
  employee_signed_name text,
  employee_signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint employee_contracts_applicant_unique unique (applicant_id),
  constraint employee_contracts_mileage_rate_check check (
    (mileage_type = 'none' and (mileage_rate is null or mileage_rate = 0))
    or (mileage_type = 'per_mile' and mileage_rate is not null and mileage_rate >= 0)
  )
);

create index if not exists employee_contracts_status_idx
  on public.employee_contracts (contract_status);

create index if not exists employee_contracts_effective_date_idx
  on public.employee_contracts (effective_date desc);
