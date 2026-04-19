-- Nurse workspace: manual weekly visit/commission lines (self-billing invoice builder).
-- Replaces reliance on payroll_visit_items for the workspace Pay UI; data is separate.

create table if not exists public.nurse_weekly_billings (
  id uuid primary key default gen_random_uuid (),
  employee_id uuid not null references public.applicants (id) on delete cascade,
  pay_period_start date not null,
  pay_period_end date not null,
  status text not null default 'draft'
    check (status in ('draft', 'submitted', 'paid')),
  submitted_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint nurse_weekly_billings_employee_period unique (employee_id, pay_period_start),
  constraint nurse_weekly_billings_period_order check (pay_period_end >= pay_period_start)
);

create index if not exists nurse_weekly_billings_employee_idx
  on public.nurse_weekly_billings (employee_id, pay_period_start desc);

comment on table public.nurse_weekly_billings is 'Per-nurse weekly self-billing submission (draft → submitted → paid).';

create table if not exists public.nurse_weekly_billing_lines (
  id uuid primary key default gen_random_uuid (),
  billing_id uuid not null references public.nurse_weekly_billings (id) on delete cascade,
  patient_id uuid not null references public.patients (id) on delete restrict,
  service_date date not null,
  line_type text not null
    check (line_type in ('soc', 'visit', 'discharge', 'recert', 'other')),
  amount numeric(12, 2) not null check (amount >= 0),
  notes text,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now ()
);

create index if not exists nurse_weekly_billing_lines_billing_idx
  on public.nurse_weekly_billing_lines (billing_id);

comment on table public.nurse_weekly_billing_lines is 'Line items on a nurse weekly self-billing.';

drop trigger if exists nurse_weekly_billings_updated_at on public.nurse_weekly_billings;
create trigger nurse_weekly_billings_updated_at
  before update on public.nurse_weekly_billings
  for each row
  execute function public.touch_payroll_updated_at ();

drop trigger if exists nurse_weekly_billing_lines_updated_at on public.nurse_weekly_billing_lines;
create trigger nurse_weekly_billing_lines_updated_at
  before update on public.nurse_weekly_billing_lines
  for each row
  execute function public.touch_payroll_updated_at ();

alter table public.nurse_weekly_billings enable row level security;
alter table public.nurse_weekly_billing_lines enable row level security;

drop policy if exists "nurse_weekly_billings_select" on public.nurse_weekly_billings;
create policy "nurse_weekly_billings_select"
  on public.nurse_weekly_billings for select to authenticated
  using (
    public.is_staff_manager_or_admin ()
    or public.is_staff_payroll_approver ()
    or (
      public.staff_applicant_id () is not null
      and employee_id = public.staff_applicant_id ()
    )
  );

drop policy if exists "nurse_weekly_billing_lines_select" on public.nurse_weekly_billing_lines;
create policy "nurse_weekly_billing_lines_select"
  on public.nurse_weekly_billing_lines for select to authenticated
  using (
    public.is_staff_manager_or_admin ()
    or public.is_staff_payroll_approver ()
    or exists (
      select 1
      from public.nurse_weekly_billings b
      where b.id = nurse_weekly_billing_lines.billing_id
        and public.staff_applicant_id () is not null
        and b.employee_id = public.staff_applicant_id ()
    )
  );
