-- PATCH: Safe, idempotent completion of weekly payroll migration.
-- Run after 20260411190000_payroll_visits.sql (or any env where base tables/helpers may exist).
-- Does not assume 20260411200000 succeeded; re-runnable.

-- ============================================================================
-- 0) DIAGNOSTICS — inspect output in Supabase migration logs
-- ============================================================================

SELECT 'diag_pg_proc_helpers' AS diagnostic,
  p.proname AS function_name,
  'exists' AS state
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname in ('touch_payroll_updated_at', 'is_staff_manager_or_admin', 'staff_applicant_id')
ORDER BY p.proname;

SELECT 'diag_staff_invalid_roles' AS diagnostic,
  sp.id,
  sp.email,
  sp.role
FROM public.staff_profiles sp
WHERE sp.role IS NOT NULL
  AND trim(sp.role) NOT IN ('super_admin', 'admin', 'manager', 'nurse', 'don');

SELECT 'diag_employee_contracts_duplicate_pairs' AS diagnostic,
  ec.applicant_id,
  ec.effective_date,
  count(*) AS row_count
FROM public.employee_contracts ec
GROUP BY ec.applicant_id, ec.effective_date
HAVING count(*) > 1;

SELECT 'diag_employee_contracts_null_effective_date' AS diagnostic,
  ec.id,
  ec.applicant_id,
  ec.effective_date
FROM public.employee_contracts ec
WHERE ec.effective_date IS NULL;

SELECT 'diag_visits_null_service_date' AS diagnostic,
  v.id,
  v.employee_id,
  v.status,
  v.check_out_time,
  v.created_at
FROM public.visits v
WHERE v.service_date IS NULL;

SELECT 'diag_visits_distinct_status' AS diagnostic,
  v.status,
  count(*) AS n
FROM public.visits v
GROUP BY v.status
ORDER BY n DESC;

-- ============================================================================
-- 1) Trigger helper: ensure touch_payroll_updated_at exists
-- ============================================================================

create or replace function public.touch_payroll_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 2) RLS helpers used by policies (idempotent)
-- ============================================================================

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

-- ============================================================================
-- 3) Staff roles: drop CHECK, normalize invalid values, re-add CHECK
-- ============================================================================

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

update public.staff_profiles sp
set role = 'manager'
where sp.role is not null
  and trim(sp.role) not in ('super_admin', 'admin', 'manager', 'nurse', 'don');

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role in ('super_admin', 'admin', 'manager', 'nurse', 'don'));

-- ============================================================================
-- 4) employee_contracts: null effective_date + duplicate-safe unique index
-- ============================================================================

update public.employee_contracts ec
set effective_date = coalesce(
  (ec.created_at at time zone 'utc')::date,
  current_date
)
where ec.effective_date is null;

drop index if exists public.employee_contracts_applicant_effective_unique;

alter table public.employee_contracts drop constraint if exists employee_contracts_applicant_unique;

do $$
declare
  dup_group_count int;
begin
  select count(*) into dup_group_count
  from (
    select 1
    from public.employee_contracts ec
    group by ec.applicant_id, ec.effective_date
    having count(*) > 1
  ) d;

  if dup_group_count > 0 then
    raise notice 'payroll_patch: skipping unique index employee_contracts_applicant_effective_unique — duplicate (applicant_id,effective_date) groups: %. Run manual cleanup.', dup_group_count;
  else
    create unique index if not exists employee_contracts_applicant_effective_unique
      on public.employee_contracts (applicant_id, effective_date);
  end if;
end $$;

create index if not exists employee_contracts_applicant_effective_lookup_idx
  on public.employee_contracts (applicant_id, effective_date);

-- ============================================================================
-- 5) visits: columns, backfill service_date, NOT NULL only when safe
-- ============================================================================

alter table public.visits add column if not exists service_date date;

alter table public.visits add column if not exists check_in_source text;

alter table public.visits add column if not exists check_out_source text;

alter table public.visits add column if not exists check_in_lat numeric(10, 7);

alter table public.visits add column if not exists check_in_lng numeric(10, 7);

alter table public.visits add column if not exists check_out_lat numeric(10, 7);

alter table public.visits add column if not exists check_out_lng numeric(10, 7);

alter table public.visits add column if not exists visit_duration_minutes int;

alter table public.visits add column if not exists held_reason text;

alter table public.visits add column if not exists manual_override_reason text;

alter table public.visits add column if not exists requires_review boolean not null default false;

comment on column public.visits.service_date is 'Date of service (for pay period + contract selection).';

update public.visits v
set service_date = (v.check_out_time at time zone 'utc')::date
where v.service_date is null
  and v.check_out_time is not null;

update public.visits v
set service_date = (v.created_at at time zone 'utc')::date
where v.service_date is null;

do $$
declare
  null_cnt int;
begin
  select count(*) into null_cnt from public.visits v where v.service_date is null;
  if null_cnt = 0 then
    alter table public.visits alter column service_date set not null;
  else
    raise notice 'payroll_patch: visits.service_date left nullable — % rows still null. Fix data then re-run ALTER COLUMN SET NOT NULL.', null_cnt;
  end if;
end $$;

-- Known legacy statuses from 20260411190000
update public.visits v
set status = 'completed'
where v.status in ('approved', 'processing');

alter table public.visits drop constraint if exists visits_status_check;

do $$
declare
  bad_cnt int;
begin
  select count(*) into bad_cnt
  from public.visits v
  where v.status not in ('pending', 'completed', 'held', 'paid');

  if bad_cnt > 0 then
    raise notice 'payroll_patch: visits with unknown status — not applying visits_status_check yet. Count: %', bad_cnt;
  else
    execute
      'alter table public.visits add constraint visits_status_check check (status in (''pending'', ''completed'', ''held'', ''paid''))';
  end if;
end $$;

alter table public.visits drop column if exists payable_amount;

alter table public.visits drop column if exists admin_approved_at;

alter table public.visits drop column if exists admin_approved_by;

alter table public.visits drop constraint if exists visits_pay_request_id_fkey;

alter table public.visits drop column if exists pay_request_id;

drop index if exists public.visits_pay_request_idx;

-- ============================================================================
-- 6) payroll_batches + payroll_visit_items
-- ============================================================================

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

drop table if exists public.pay_requests cascade;

-- ============================================================================
-- 7) Triggers (only when touch_payroll_updated_at exists — it always does above)
-- ============================================================================

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

-- ============================================================================
-- 8) Payroll approver helper + RLS
-- ============================================================================

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

-- ============================================================================
-- 9) Post-check diagnostics
-- ============================================================================

SELECT 'postcheck_staff_invalid_roles' AS diagnostic, count(*) AS n
FROM public.staff_profiles sp
WHERE sp.role IS NOT NULL
  AND trim(sp.role) NOT IN ('super_admin', 'admin', 'manager', 'nurse', 'don');

SELECT 'postcheck_visits_null_service_date' AS diagnostic, count(*) AS n
FROM public.visits v
WHERE v.service_date IS NULL;

SELECT 'postcheck_contract_duplicates' AS diagnostic, count(*) AS n
FROM (
  select applicant_id, effective_date
  from public.employee_contracts
  group by applicant_id, effective_date
  having count(*) > 1
) d;

-- ============================================================================
-- MANUAL CLEANUP (run in SQL editor only after reviewing diagnostics; not auto-run)
-- ============================================================================
--
-- A) Duplicate employee_contracts (keep newest row per pair):
--    WITH ranked AS (
--      SELECT id, ROW_NUMBER() OVER (
--        PARTITION BY applicant_id, effective_date ORDER BY created_at DESC NULLS LAST, id DESC
--      ) AS rn
--      FROM public.employee_contracts
--    )
--    DELETE FROM public.employee_contracts ec
--    USING ranked r WHERE ec.id = r.id AND r.rn > 1;
--    Then re-run: CREATE UNIQUE INDEX IF NOT EXISTS employee_contracts_applicant_effective_unique
--      ON public.employee_contracts (applicant_id, effective_date);
--
-- B) Visits still NULL service_date (set manually or delete bad rows):
--    UPDATE public.visits SET service_date = (created_at AT TIME ZONE 'utc')::date WHERE service_date IS NULL;
--    OR: UPDATE ... SET service_date = '2026-01-01' WHERE id = '...';
--    Then: ALTER TABLE public.visits ALTER COLUMN service_date SET NOT NULL;
--
-- C) Unknown visit statuses (inspect then map):
--    UPDATE public.visits SET status = 'completed' WHERE status = 'legacy_foo';
--    Then re-apply visits_status_check via patch DO block or:
--    ALTER TABLE public.visits ADD CONSTRAINT visits_status_check
--      CHECK (status IN ('pending', 'completed', 'held', 'paid'));
