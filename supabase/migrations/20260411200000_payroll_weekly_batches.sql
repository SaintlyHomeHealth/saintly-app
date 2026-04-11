-- Weekly payroll batches, immutable payroll_visit_items, visit audit fields,
-- date-based employee_contracts, DON role, drop on-demand pay_requests.

-- ---------------------------------------------------------------------------
-- Staff role: DON (Director of Nursing) — payroll approver alongside admin
-- ---------------------------------------------------------------------------

alter table public.staff_profiles drop constraint if exists staff_profiles_role_check;

do $$
declare
  con_name text;
begin
  for con_name in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'staff_profiles'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%in (%'
  loop
    execute format('alter table public.staff_profiles drop constraint %I', con_name);
  end loop;
end $$;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role in ('super_admin', 'admin', 'manager', 'nurse', 'don'));

-- ---------------------------------------------------------------------------
-- Multiple contract versions per applicant (effective-date history)
-- ---------------------------------------------------------------------------

alter table public.employee_contracts drop constraint if exists employee_contracts_applicant_unique;

create unique index if not exists employee_contracts_applicant_effective_unique
  on public.employee_contracts (applicant_id, effective_date);

-- ---------------------------------------------------------------------------
-- Visits: audit fields, service date, simplified lifecycle
-- ---------------------------------------------------------------------------

alter table public.visits
  add column if not exists service_date date;

alter table public.visits
  add column if not exists check_in_source text;

alter table public.visits
  add column if not exists check_out_source text;

alter table public.visits
  add column if not exists check_in_lat numeric(10, 7);

alter table public.visits
  add column if not exists check_in_lng numeric(10, 7);

alter table public.visits
  add column if not exists check_out_lat numeric(10, 7);

alter table public.visits
  add column if not exists check_out_lng numeric(10, 7);

alter table public.visits
  add column if not exists visit_duration_minutes int;

alter table public.visits
  add column if not exists held_reason text;

alter table public.visits
  add column if not exists manual_override_reason text;

alter table public.visits
  add column if not exists requires_review boolean not null default false;

comment on column public.visits.service_date is 'Date of service (for pay period + contract selection).';

-- Backfill service_date from check-out or created_at
update public.visits
set service_date = (check_out_time at time zone 'utc')::date
where service_date is null
  and check_out_time is not null;

update public.visits
set service_date = (created_at at time zone 'utc')::date
where service_date is null;

alter table public.visits
  alter column service_date set not null;

-- Normalize legacy statuses into weekly payroll model
update public.visits
set status = 'completed'
where status in ('approved', 'processing');

alter table public.visits drop constraint if exists visits_status_check;

alter table public.visits
  add constraint visits_status_check
  check (status in ('pending', 'completed', 'held', 'paid'));

-- Remove columns superseded by payroll_visit_items / batches
alter table public.visits drop column if exists payable_amount;
alter table public.visits drop column if exists admin_approved_at;
alter table public.visits drop column if exists admin_approved_by;

alter table public.visits drop constraint if exists visits_pay_request_id_fkey;

alter table public.visits drop column if exists pay_request_id;

drop index if exists public.visits_pay_request_idx;

-- ---------------------------------------------------------------------------
-- Payroll batches (weekly; replaces pay_requests)
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_batches (
  id uuid primary key default gen_random_uuid (),
  pay_period_start date not null,
  pay_period_end date not null,
  submission_deadline timestamptz not null,
  pay_date date not null,
  status text not null default 'open'
    check (status in ('open', 'submitted', 'processing', 'paid', 'closed')),
  payroll_provider text,
  external_batch_id text,
  external_provider text,
  external_payment_id text,
  export_status text default 'pending'
    check (export_status in ('pending', 'exported', 'failed')),
  exported_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint payroll_batches_period_unique unique (pay_period_start, pay_period_end),
  constraint payroll_batches_period_order check (pay_period_end >= pay_period_start)
);

create index if not exists payroll_batches_status_idx on public.payroll_batches (status, pay_period_start desc);

comment on table public.payroll_batches is 'Weekly payroll runs (Mon–Sun period; Tuesday submit; Wednesday pay).';

-- ---------------------------------------------------------------------------
-- Immutable payroll line items (snapshots at eligibility / lock time)
-- ---------------------------------------------------------------------------

create table if not exists public.payroll_visit_items (
  id uuid primary key default gen_random_uuid (),
  visit_id uuid not null references public.visits (id) on delete cascade,
  employee_id uuid not null references public.applicants (id) on delete cascade,
  contract_id uuid references public.employee_contracts (id) on delete set null,
  employment_classification_snapshot text not null
    check (employment_classification_snapshot in ('employee', 'contractor')),
  pay_type_snapshot text not null
    check (pay_type_snapshot in ('per_visit', 'hourly', 'salary')),
  pay_rate_snapshot numeric(12, 4) not null check (pay_rate_snapshot >= 0),
  hours_snapshot numeric(12, 4),
  gross_amount numeric(12, 2) not null default 0 check (gross_amount >= 0),
  status text not null default 'draft'
    check (status in ('draft', 'ready', 'submitted', 'paid', 'void')),
  payout_route text not null default 'w2'
    check (payout_route in ('w2', 'contractor_1099')),
  approved_by uuid references auth.users (id) on delete set null,
  approved_at timestamptz,
  payroll_batch_id uuid references public.payroll_batches (id) on delete set null,
  created_at timestamptz not null default now (),
  updated_at timestamptz not null default now (),
  constraint payroll_visit_items_visit_unique unique (visit_id)
);

create index if not exists payroll_visit_items_employee_idx on public.payroll_visit_items (employee_id, status);
create index if not exists payroll_visit_items_batch_idx on public.payroll_visit_items (payroll_batch_id)
  where payroll_batch_id is not null;
create index if not exists payroll_visit_items_route_idx on public.payroll_visit_items (payout_route, status);

comment on table public.payroll_visit_items is 'Immutable pay snapshots; gross/rates copied from contract at sync time.';

-- Drop legacy pay_requests (after visits.pay_request_id removed)
drop table if exists public.pay_requests cascade;

-- ---------------------------------------------------------------------------
-- Timestamps on payroll_batches
-- ---------------------------------------------------------------------------

drop trigger if exists payroll_batches_updated_at on public.payroll_batches;
create trigger payroll_batches_updated_at
  before update on public.payroll_batches
  for each row
  execute function public.touch_payroll_updated_at ();

drop trigger if exists payroll_visit_items_updated_at on public.payroll_visit_items;
create trigger payroll_visit_items_updated_at
  before update on public.payroll_visit_items
  for each row
  execute function public.touch_payroll_updated_at ();

-- ---------------------------------------------------------------------------
-- RLS helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_staff_payroll_approver ()
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
      and sp.role in ('super_admin', 'admin', 'don')
  );
$$;

-- ---------------------------------------------------------------------------
-- RLS: new tables (read via app patterns; mutations via service role)
-- ---------------------------------------------------------------------------

alter table public.payroll_batches enable row level security;
alter table public.payroll_visit_items enable row level security;

drop policy if exists "payroll_batches_select" on public.payroll_batches;
create policy "payroll_batches_select"
  on public.payroll_batches for select to authenticated
  using (
    public.is_staff_manager_or_admin ()
    or public.is_staff_payroll_approver ()
    or exists (
      select 1
      from public.payroll_visit_items pvi
      inner join public.staff_profiles sp on sp.applicant_id = pvi.employee_id
      where pvi.payroll_batch_id = payroll_batches.id
        and sp.user_id = auth.uid ()
    )
  );

drop policy if exists "payroll_visit_items_select" on public.payroll_visit_items;
create policy "payroll_visit_items_select"
  on public.payroll_visit_items for select to authenticated
  using (
    public.is_staff_manager_or_admin ()
    or public.is_staff_payroll_approver ()
    or (
      public.staff_applicant_id () is not null
      and employee_id = public.staff_applicant_id ()
    )
  );
