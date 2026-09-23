-- Recurring compliance logs for Saintly's physical quarterly binders.
-- Reuses patients and staff_profiles. Does not replace employee credential compliance.

create or replace function public.compliance_touch_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Blocks silent edits of finalized rows. Unlock is status finalized -> draft
-- with no other content changes. App records that unlock in compliance_change_log.
create or replace function public.compliance_guard_finalized()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  oldj jsonb;
  newj jsonb;
  allowed text[] := array['status', 'updated_at', 'finalized_at', 'finalized_by'];
  k text;
begin
  if tg_op = 'DELETE' then
    if old.status = 'finalized' then
      raise exception 'Finalized compliance records cannot be deleted.';
    end if;
    return old;
  end if;

  if old.status is distinct from 'finalized' then
    return new;
  end if;

  if new.status is distinct from 'draft' then
    raise exception 'Finalized compliance records cannot be changed.';
  end if;

  oldj := to_jsonb(old);
  newj := to_jsonb(new);

  for k in select jsonb_object_keys(oldj)
  loop
    if k = any (allowed) then
      continue;
    end if;
    if (oldj -> k) is distinct from (newj -> k) then
      raise exception 'Unlock cannot change form content.';
    end if;
  end loop;

  new.finalized_at := null;
  new.finalized_by := null;
  return new;
end;
$$;

create or replace function public.compliance_guard_completed_project()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  oldj jsonb;
  newj jsonb;
  allowed text[] := array['status', 'updated_at', 'completed_at'];
  k text;
begin
  if tg_op = 'DELETE' then
    raise exception 'QAPI projects cannot be deleted.';
  end if;

  if old.status is distinct from 'completed' then
    return new;
  end if;

  if new.status not in ('planning', 'active', 'monitoring') then
    raise exception 'Completed QAPI project cannot be edited. Reopen it first.';
  end if;

  oldj := to_jsonb(old);
  newj := to_jsonb(new);

  for k in select jsonb_object_keys(oldj)
  loop
    if k = any (allowed) then
      continue;
    end if;
    if (oldj -> k) is distinct from (newj -> k) then
      raise exception 'Reopen cannot change project content.';
    end if;
  end loop;

  new.completed_at := null;
  return new;
end;
$$;

create or replace function public.compliance_block_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception 'This compliance history cannot be edited or deleted.';
end;
$$;

-- True when the signed-in user is active office staff who may keep compliance logs.
-- security invoker: staff_profiles RLS already allows each user to read their own row.
create or replace function public.compliance_staff_can_write()
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select exists (
    select 1
    from public.staff_profiles sp
    where sp.user_id = (select auth.uid())
      and sp.is_active is distinct from false
      and sp.role in ('manager', 'admin', 'super_admin', 'don')
  );
$$;

revoke all on function public.compliance_touch_updated_at() from public, anon;
revoke all on function public.compliance_guard_finalized() from public, anon;
revoke all on function public.compliance_guard_completed_project() from public, anon;
revoke all on function public.compliance_block_mutation() from public, anon;
revoke all on function public.compliance_staff_can_write() from public, anon;
grant execute on function public.compliance_touch_updated_at() to authenticated, service_role;
grant execute on function public.compliance_guard_finalized() to authenticated, service_role;
grant execute on function public.compliance_guard_completed_project() to authenticated, service_role;
grant execute on function public.compliance_block_mutation() to authenticated, service_role;
grant execute on function public.compliance_staff_can_write() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Meetings (many per quarter)
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_meetings (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  quarter integer not null check (quarter between 1 and 4),
  meeting_type text not null,
  meeting_date date,
  start_time time,
  end_time time,
  attendees text,
  topics_discussed text,
  problems_identified text,
  actions_decided text,
  person_responsible text,
  due_date date,
  follow_up_prior text,
  additional_notes text,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  admin_signed_by_user_id uuid,
  admin_signed_name text,
  admin_signed_at timestamptz,
  clinical_signed_by_user_id uuid,
  clinical_signed_name text,
  clinical_signed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  finalized_at timestamptz,
  finalized_by uuid
);

create index if not exists compliance_meetings_period_idx
  on public.compliance_meetings (year, quarter, meeting_date);

-- ---------------------------------------------------------------------------
-- On-call log
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_on_call_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null,
  patient_id uuid references public.patients (id) on delete set null,
  patient_name text not null,
  reason text not null,
  action_taken text not null,
  handled_by_user_id uuid,
  handled_by_name text not null,
  follow_up_needed boolean not null default false,
  follow_up_completed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists compliance_on_call_logs_occurred_idx
  on public.compliance_on_call_logs (occurred_at desc);

create table if not exists public.compliance_on_call_attestations (
  id uuid primary key default gen_random_uuid(),
  period_kind text not null check (period_kind in ('month', 'quarter')),
  year integer not null check (year between 2000 and 2100),
  quarter integer check (quarter between 1 and 4),
  month integer check (month between 1 and 12),
  statement text not null,
  administrator_name text not null,
  signed_by_user_id uuid,
  signed_name text not null,
  signed_at timestamptz not null,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint compliance_on_call_attestations_period_chk check (
    (period_kind = 'quarter' and quarter is not null and month is null)
    or
    (period_kind = 'month' and month is not null and quarter is null)
  )
);

create unique index if not exists compliance_on_call_attestations_period_uidx
  on public.compliance_on_call_attestations (period_kind, year, coalesce(quarter, 0), coalesce(month, 0));

-- ---------------------------------------------------------------------------
-- Quarterly single-record forms
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_safety_checks (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  quarter integer not null check (quarter between 1 and 4),
  inspection_date date,
  completed_by_name text,
  checks jsonb not null default '{}'::jsonb,
  problems_found text,
  corrective_action text,
  date_corrected date,
  corrected_by text,
  completed_signed_by_user_id uuid,
  completed_signed_name text,
  completed_signed_at timestamptz,
  admin_signed_by_user_id uuid,
  admin_signed_name text,
  admin_signed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  finalized_at timestamptz,
  finalized_by uuid,
  constraint compliance_safety_checks_period_key unique (year, quarter)
);

create table if not exists public.compliance_emergency_reviews (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  quarter integer not null check (quarter between 1 and 4),
  review_date date,
  reviewed_by_name text,
  checks jsonb not null default '{}'::jsonb,
  changes_required boolean not null default false,
  changes_made text,
  date_updated date,
  updated_by_name text,
  admin_signed_by_user_id uuid,
  admin_signed_name text,
  admin_signed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  finalized_at timestamptz,
  finalized_by uuid,
  constraint compliance_emergency_reviews_period_key unique (year, quarter)
);

create table if not exists public.compliance_emergency_drills (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  quarter integer not null check (quarter between 1 and 4),
  exercise_date date,
  exercise_type text,
  scenario text,
  participants text,
  what_happened text,
  what_worked text,
  what_did_not_work text,
  problems_identified text,
  corrective_action text,
  person_responsible text,
  corrective_due_date date,
  plan_updated boolean,
  additional_notes text,
  admin_signed_by_user_id uuid,
  admin_signed_name text,
  admin_signed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  finalized_at timestamptz,
  finalized_by uuid
);

create index if not exists compliance_emergency_drills_period_idx
  on public.compliance_emergency_drills (year, quarter, exercise_date);

create table if not exists public.compliance_qapi_reviews (
  id uuid primary key default gen_random_uuid(),
  year integer not null check (year between 2000 and 2100),
  quarter integer not null check (quarter between 1 and 4),
  review_date date,
  reviewed_by_name text,
  patients_served integer check (patients_served is null or patients_served >= 0),
  hospitalizations integer check (hospitalizations is null or hospitalizations >= 0),
  er_visits integer check (er_visits is null or er_visits >= 0),
  falls integer check (falls is null or falls >= 0),
  medication_errors integer check (medication_errors is null or medication_errors >= 0),
  complaints integer check (complaints is null or complaints >= 0),
  missed_visits integer check (missed_visits is null or missed_visits >= 0),
  infections integer check (infections is null or infections >= 0),
  late_documentation integer check (late_documentation is null or late_documentation >= 0),
  late_oasis integer check (late_oasis is null or late_oasis >= 0),
  unsigned_orders integer check (unsigned_orders is null or unsigned_orders >= 0),
  other_events integer check (other_events is null or other_events >= 0),
  counts_overridden boolean not null default false,
  trends text,
  action_plan text,
  previous_action_effective text check (
    previous_action_effective is null
    or previous_action_effective in ('yes', 'no', 'not_applicable')
  ),
  additional_notes text,
  admin_signed_by_user_id uuid,
  admin_signed_name text,
  admin_signed_at timestamptz,
  clinical_signed_by_user_id uuid,
  clinical_signed_name text,
  clinical_signed_at timestamptz,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  finalized_at timestamptz,
  finalized_by uuid,
  constraint compliance_qapi_reviews_period_key unique (year, quarter)
);

-- ---------------------------------------------------------------------------
-- QAPI project (one main active project; history kept)
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_qapi_projects (
  id uuid primary key default gen_random_uuid(),
  project_name text not null,
  problem_identified text,
  reason_selected text,
  baseline text,
  goal text,
  action_intervention text,
  responsible_person text,
  start_date date,
  target_date date,
  current_results text,
  status text not null default 'planning' check (status in ('planning', 'active', 'monitoring', 'completed')),
  outcome text,
  goal_met text check (goal_met is null or goal_met in ('yes', 'no', 'partially')),
  follow_up_needed text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid,
  completed_at timestamptz
);

create index if not exists compliance_qapi_projects_status_idx
  on public.compliance_qapi_projects (status, updated_at desc);

create table if not exists public.compliance_qapi_project_updates (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.compliance_qapi_projects (id) on delete cascade,
  update_date date not null,
  update_text text not null,
  result text,
  entered_by_user_id uuid,
  entered_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists compliance_qapi_project_updates_project_idx
  on public.compliance_qapi_project_updates (project_id, update_date desc, created_at desc);

-- ---------------------------------------------------------------------------
-- Incident / complaint log
-- ---------------------------------------------------------------------------
create table if not exists public.compliance_incident_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_on date not null,
  patient_id uuid references public.patients (id) on delete set null,
  patient_name text,
  incident_type text not null,
  description text not null,
  action_taken text,
  handled_by_user_id uuid,
  handled_by_name text,
  follow_up_needed boolean not null default false,
  resolved boolean not null default false,
  resolution_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid
);

create index if not exists compliance_incident_logs_occurred_idx
  on public.compliance_incident_logs (occurred_on desc, incident_type);

-- Optional "not applicable this quarter" marks. Never treated as a completed form.
create table if not exists public.compliance_na_marks (
  year integer not null check (year between 2000 and 2100),
  quarter integer not null check (quarter between 1 and 4),
  item_key text not null check (item_key in ('meetings', 'safety', 'emergency_review', 'drill', 'qapi_review')),
  reason text,
  marked_by uuid,
  marked_at timestamptz not null default now(),
  primary key (year, quarter, item_key)
);

create table if not exists public.compliance_change_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  reason text,
  actor_user_id uuid,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists compliance_change_log_entity_idx
  on public.compliance_change_log (entity_type, entity_id, created_at desc);

-- Triggers
drop trigger if exists compliance_meetings_touch on public.compliance_meetings;
create trigger compliance_meetings_touch
  before update on public.compliance_meetings
  for each row execute function public.compliance_touch_updated_at();

drop trigger if exists compliance_meetings_guard on public.compliance_meetings;
create trigger compliance_meetings_guard
  before update or delete on public.compliance_meetings
  for each row execute function public.compliance_guard_finalized();

drop trigger if exists compliance_on_call_logs_touch on public.compliance_on_call_logs;
create trigger compliance_on_call_logs_touch
  before update on public.compliance_on_call_logs
  for each row execute function public.compliance_touch_updated_at();

drop trigger if exists compliance_on_call_attestations_lock on public.compliance_on_call_attestations;
create trigger compliance_on_call_attestations_lock
  before update or delete on public.compliance_on_call_attestations
  for each row execute function public.compliance_block_mutation();

drop trigger if exists compliance_safety_checks_touch on public.compliance_safety_checks;
create trigger compliance_safety_checks_touch
  before update on public.compliance_safety_checks
  for each row execute function public.compliance_touch_updated_at();

drop trigger if exists compliance_safety_checks_guard on public.compliance_safety_checks;
create trigger compliance_safety_checks_guard
  before update or delete on public.compliance_safety_checks
  for each row execute function public.compliance_guard_finalized();

drop trigger if exists compliance_emergency_reviews_touch on public.compliance_emergency_reviews;
create trigger compliance_emergency_reviews_touch
  before update on public.compliance_emergency_reviews
  for each row execute function public.compliance_touch_updated_at();

drop trigger if exists compliance_emergency_reviews_guard on public.compliance_emergency_reviews;
create trigger compliance_emergency_reviews_guard
  before update or delete on public.compliance_emergency_reviews
  for each row execute function public.compliance_guard_finalized();

drop trigger if exists compliance_emergency_drills_touch on public.compliance_emergency_drills;
create trigger compliance_emergency_drills_touch
  before update on public.compliance_emergency_drills
  for each row execute function public.compliance_touch_updated_at();

drop trigger if exists compliance_emergency_drills_guard on public.compliance_emergency_drills;
create trigger compliance_emergency_drills_guard
  before update or delete on public.compliance_emergency_drills
  for each row execute function public.compliance_guard_finalized();

drop trigger if exists compliance_qapi_reviews_touch on public.compliance_qapi_reviews;
create trigger compliance_qapi_reviews_touch
  before update on public.compliance_qapi_reviews
  for each row execute function public.compliance_touch_updated_at();

drop trigger if exists compliance_qapi_reviews_guard on public.compliance_qapi_reviews;
create trigger compliance_qapi_reviews_guard
  before update or delete on public.compliance_qapi_reviews
  for each row execute function public.compliance_guard_finalized();

drop trigger if exists compliance_qapi_projects_touch on public.compliance_qapi_projects;
create trigger compliance_qapi_projects_touch
  before update on public.compliance_qapi_projects
  for each row execute function public.compliance_touch_updated_at();

drop trigger if exists compliance_qapi_projects_guard on public.compliance_qapi_projects;
create trigger compliance_qapi_projects_guard
  before update or delete on public.compliance_qapi_projects
  for each row execute function public.compliance_guard_completed_project();

drop trigger if exists compliance_qapi_project_updates_lock on public.compliance_qapi_project_updates;
create trigger compliance_qapi_project_updates_lock
  before update or delete on public.compliance_qapi_project_updates
  for each row execute function public.compliance_block_mutation();

drop trigger if exists compliance_incident_logs_touch on public.compliance_incident_logs;
create trigger compliance_incident_logs_touch
  before update on public.compliance_incident_logs
  for each row execute function public.compliance_touch_updated_at();

drop trigger if exists compliance_change_log_lock on public.compliance_change_log;
create trigger compliance_change_log_lock
  before update or delete on public.compliance_change_log
  for each row execute function public.compliance_block_mutation();

-- RLS
alter table public.compliance_meetings enable row level security;
alter table public.compliance_on_call_logs enable row level security;
alter table public.compliance_on_call_attestations enable row level security;
alter table public.compliance_safety_checks enable row level security;
alter table public.compliance_emergency_reviews enable row level security;
alter table public.compliance_emergency_drills enable row level security;
alter table public.compliance_qapi_reviews enable row level security;
alter table public.compliance_qapi_projects enable row level security;
alter table public.compliance_qapi_project_updates enable row level security;
alter table public.compliance_incident_logs enable row level security;
alter table public.compliance_na_marks enable row level security;
alter table public.compliance_change_log enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'compliance_meetings',
    'compliance_on_call_logs',
    'compliance_on_call_attestations',
    'compliance_safety_checks',
    'compliance_emergency_reviews',
    'compliance_emergency_drills',
    'compliance_qapi_reviews',
    'compliance_qapi_projects',
    'compliance_qapi_project_updates',
    'compliance_incident_logs',
    'compliance_na_marks',
    'compliance_change_log'
  ]
  loop
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.compliance_staff_can_write())',
      t || '_select', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.compliance_staff_can_write())',
      t || '_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.compliance_staff_can_write()) with check (public.compliance_staff_can_write())',
      t || '_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.compliance_staff_can_write())',
      t || '_delete', t
    );
  end loop;
end $$;
