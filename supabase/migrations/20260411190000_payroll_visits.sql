-- Payroll visits, pay requests, and YTD earnings.
-- Links staff logins to applicants for employee_contracts via staff_profiles.applicant_id.

-- ---------------------------------------------------------------------------
-- Staff ↔ applicant (employee) link
-- ---------------------------------------------------------------------------

alter table public.staff_profiles
  add column if not exists applicant_id uuid references public.applicants (id) on delete set null;

create unique index if not exists staff_profiles_applicant_id_unique_when_set
  on public.staff_profiles (applicant_id)
  where applicant_id is not null;

comment on column public.staff_profiles.applicant_id is
  'When set, maps this login to applicants.id for payroll and employee_contracts.';

-- ---------------------------------------------------------------------------
-- Pay requests (created before visits FK references this table)
-- ---------------------------------------------------------------------------

create table if not exists public.pay_requests (
  id uuid primary key default gen_random_uuid (),
  employee_id uuid not null references public.applicants (id) on delete cascade,
  total_amount numeric(12, 2) not null default 0 check (total_amount >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'paid')),
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists pay_requests_employee_idx on public.pay_requests (employee_id, created_at desc);
create index if not exists pay_requests_status_idx on public.pay_requests (status);

-- ---------------------------------------------------------------------------
-- Visits (payroll lifecycle; employee_id = applicants.id)
-- ---------------------------------------------------------------------------

create table if not exists public.visits (
  id uuid primary key default gen_random_uuid (),
  employee_id uuid not null references public.applicants (id) on delete cascade,
  patient_id uuid references public.patients (id) on delete set null,
  patient_visit_id uuid references public.patient_visits (id) on delete set null,
  visit_type text not null default 'visit',
  status text not null default 'pending'
    check (status in ('pending', 'completed', 'held', 'approved', 'processing', 'paid')),
  check_in_time timestamptz,
  check_out_time timestamptz,
  note_completed boolean not null default false,
  payable_amount numeric(12, 2) not null default 0 check (payable_amount >= 0),
  admin_approved_at timestamptz,
  admin_approved_by uuid references auth.users (id) on delete set null,
  pay_request_id uuid references public.pay_requests (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists visits_employee_status_idx on public.visits (employee_id, status);
create index if not exists visits_patient_idx on public.visits (patient_id);
create index if not exists visits_pay_request_idx on public.visits (pay_request_id)
  where pay_request_id is not null;

-- ---------------------------------------------------------------------------
-- Year-scoped earnings aggregates (applicant = employee)
-- ---------------------------------------------------------------------------

create table if not exists public.employee_earnings (
  employee_id uuid not null references public.applicants (id) on delete cascade,
  earnings_year int not null check (earnings_year >= 2000 and earnings_year <= 2100),
  ytd_earnings numeric(12, 2) not null default 0 check (ytd_earnings >= 0),
  total_paid numeric(12, 2) not null default 0 check (total_paid >= 0),
  total_pending numeric(12, 2) not null default 0 check (total_pending >= 0),
  updated_at timestamptz not null default now (),
  primary key (employee_id, earnings_year)
);

create index if not exists employee_earnings_year_idx on public.employee_earnings (earnings_year);

-- ---------------------------------------------------------------------------
-- Timestamps
-- ---------------------------------------------------------------------------

create or replace function public.touch_payroll_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists pay_requests_updated_at on public.pay_requests;
create trigger pay_requests_updated_at
  before update on public.pay_requests
  for each row
  execute function public.touch_payroll_updated_at ();

drop trigger if exists visits_updated_at on public.visits;
create trigger visits_updated_at
  before update on public.visits
  for each row
  execute function public.touch_payroll_updated_at ();

drop trigger if exists employee_earnings_updated_at on public.employee_earnings;
create trigger employee_earnings_updated_at
  before update on public.employee_earnings
  for each row
  execute function public.touch_payroll_updated_at ();

-- ---------------------------------------------------------------------------
-- RLS helpers (stable; SECURITY DEFINER for auth.uid())
-- ---------------------------------------------------------------------------

create or replace function public.is_staff_manager_or_admin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = auth.uid ()
      and sp.is_active = true
      and sp.role in ('manager', 'admin', 'super_admin')
  );
$$;

create or replace function public.staff_applicant_id ()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select sp.applicant_id
  from public.staff_profiles sp
  where sp.user_id = auth.uid ()
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- RLS: read-only for authenticated (mutations via service role in app)
-- ---------------------------------------------------------------------------

alter table public.pay_requests enable row level security;
alter table public.visits enable row level security;
alter table public.employee_earnings enable row level security;

drop policy if exists "pay_requests_select_payroll" on public.pay_requests;
create policy "pay_requests_select_payroll"
  on public.pay_requests for select to authenticated
  using (
    public.is_staff_manager_or_admin ()
    or (
      public.staff_applicant_id () is not null
      and employee_id = public.staff_applicant_id ()
    )
  );

drop policy if exists "visits_select_payroll" on public.visits;
create policy "visits_select_payroll"
  on public.visits for select to authenticated
  using (
    public.is_staff_manager_or_admin ()
    or (
      public.staff_applicant_id () is not null
      and employee_id = public.staff_applicant_id ()
    )
  );

drop policy if exists "employee_earnings_select_payroll" on public.employee_earnings;
create policy "employee_earnings_select_payroll"
  on public.employee_earnings for select to authenticated
  using (
    public.is_staff_manager_or_admin ()
    or (
      public.staff_applicant_id () is not null
      and employee_id = public.staff_applicant_id ()
    )
  );
