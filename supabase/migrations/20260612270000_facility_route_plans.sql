-- Phase 21: Saved route plans + check-in / visit proof.

create table if not exists public.facility_route_plans (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  route_date date not null default current_date,
  assigned_rep_id uuid null references auth.users (id) on delete set null,
  created_by uuid null references auth.users (id) on delete set null,
  status text not null default 'draft',
  start_latitude double precision null,
  start_longitude double precision null,
  start_address text null,
  started_at timestamptz null,
  completed_at timestamptz null,
  completed_by uuid null references auth.users (id) on delete set null,
  notes text null,
  metadata jsonb null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_route_plans_status_check
    check (status in ('draft', 'planned', 'in_progress', 'completed', 'canceled'))
);

create table if not exists public.facility_route_stops (
  id uuid primary key default gen_random_uuid(),
  route_plan_id uuid not null references public.facility_route_plans (id) on delete cascade,
  stop_order integer not null,
  facility_id uuid null references public.facilities (id) on delete set null,
  google_place_id text null,
  name text not null,
  address text null,
  phone text null,
  latitude double precision null,
  longitude double precision null,
  source text null,
  portal_status text null,
  status text not null default 'pending',
  planned_arrival_at timestamptz null,
  checked_in_at timestamptz null,
  checked_in_latitude double precision null,
  checked_in_longitude double precision null,
  checked_out_at timestamptz null,
  completed_at timestamptz null,
  skipped_at timestamptz null,
  skip_reason text null,
  linked_activity_id uuid null references public.facility_activities (id) on delete set null,
  linked_photo_id uuid null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_route_stops_status_check
    check (status in ('pending', 'checked_in', 'completed', 'skipped', 'canceled')),
  constraint facility_route_stops_route_order_unique unique (route_plan_id, stop_order)
);

create index if not exists facility_route_plans_route_date_idx on public.facility_route_plans (route_date);
create index if not exists facility_route_plans_assigned_rep_id_idx on public.facility_route_plans (assigned_rep_id);
create index if not exists facility_route_plans_status_idx on public.facility_route_plans (status);
create index if not exists facility_route_plans_created_at_idx on public.facility_route_plans (created_at desc);

create index if not exists facility_route_stops_route_plan_id_idx on public.facility_route_stops (route_plan_id);
create index if not exists facility_route_stops_facility_id_idx on public.facility_route_stops (facility_id);
create index if not exists facility_route_stops_status_idx on public.facility_route_stops (status);
create index if not exists facility_route_stops_checked_in_at_idx on public.facility_route_stops (checked_in_at);
create index if not exists facility_route_stops_completed_at_idx on public.facility_route_stops (completed_at);

create or replace function public.touch_facility_route_plans_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists facility_route_plans_updated_at on public.facility_route_plans;
create trigger facility_route_plans_updated_at
  before update on public.facility_route_plans
  for each row execute function public.touch_facility_route_plans_updated_at();

create or replace function public.touch_facility_route_stops_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists facility_route_stops_updated_at on public.facility_route_stops;
create trigger facility_route_stops_updated_at
  before update on public.facility_route_stops
  for each row execute function public.touch_facility_route_stops_updated_at();

alter table public.facility_route_plans enable row level security;
alter table public.facility_route_stops enable row level security;

drop policy if exists "facility_route_plans_select_staff" on public.facility_route_plans;
create policy "facility_route_plans_select_staff"
  on public.facility_route_plans for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'sales_agent')
    )
  );

drop policy if exists "facility_route_stops_select_staff" on public.facility_route_stops;
create policy "facility_route_stops_select_staff"
  on public.facility_route_stops for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'sales_agent')
    )
  );

comment on table public.facility_route_plans is 'Saved field-sales outreach route plans.';
comment on table public.facility_route_stops is 'Ordered stops on a saved facility route plan.';
