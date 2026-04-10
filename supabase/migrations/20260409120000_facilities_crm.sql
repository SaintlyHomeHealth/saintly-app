-- Outside sales: referral-source facilities, contacts, and visit/activity log.

create table if not exists public.facilities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null,
  type text,
  status text not null default 'New',
  priority text not null default 'Medium',
  address_line_1 text,
  address_line_2 text,
  city text,
  state text,
  zip text,
  main_phone text,
  fax text,
  email text,
  website text,
  territory text,
  assigned_rep_user_id uuid references auth.users (id) on delete set null,
  referral_method text,
  referral_notes text,
  intake_notes text,
  best_time_to_visit text,
  last_visit_at timestamptz,
  next_follow_up_at timestamptz,
  is_active boolean not null default true,
  general_notes text
);

create index if not exists facilities_name_idx on public.facilities (name);
create index if not exists facilities_city_idx on public.facilities (city);
create index if not exists facilities_assigned_rep_user_id_idx on public.facilities (assigned_rep_user_id);
create index if not exists facilities_next_follow_up_at_idx on public.facilities (next_follow_up_at);

create table if not exists public.facility_contacts (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  first_name text,
  last_name text,
  full_name text,
  title text,
  department text,
  direct_phone text,
  mobile_phone text,
  fax text,
  email text,
  preferred_contact_method text,
  best_time_to_reach text,
  is_decision_maker boolean not null default false,
  influence_level text,
  notes text,
  is_active boolean not null default true
);

create index if not exists facility_contacts_facility_id_idx on public.facility_contacts (facility_id);

create table if not exists public.facility_activities (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  facility_contact_id uuid references public.facility_contacts (id) on delete set null,
  staff_user_id uuid references auth.users (id) on delete set null,
  activity_type text not null,
  outcome text,
  activity_at timestamptz not null default now(),
  notes text,
  next_follow_up_at timestamptz,
  follow_up_task text,
  referral_potential text,
  materials_dropped_off boolean not null default false,
  got_business_card boolean not null default false,
  requested_packet boolean not null default false,
  referral_process_captured boolean not null default false
);

create index if not exists facility_activities_facility_id_idx on public.facility_activities (facility_id);
create index if not exists facility_activities_activity_at_idx on public.facility_activities (activity_at desc);

-- updated_at
create or replace function public.touch_facilities_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists facilities_updated_at on public.facilities;
create trigger facilities_updated_at
  before update on public.facilities
  for each row
  execute function public.touch_facilities_updated_at();

create or replace function public.touch_facility_contacts_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists facility_contacts_updated_at on public.facility_contacts;
create trigger facility_contacts_updated_at
  before update on public.facility_contacts
  for each row
  execute function public.touch_facility_contacts_updated_at();

create or replace function public.touch_facility_activities_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists facility_activities_updated_at on public.facility_activities;
create trigger facility_activities_updated_at
  before update on public.facility_activities
  for each row
  execute function public.touch_facility_activities_updated_at();

-- When a visit/activity is logged, roll up last visit and optional follow-up on the parent facility.
create or replace function public.facility_activities_after_insert_sync_facility()
returns trigger
language plpgsql
as $$
begin
  update public.facilities f
  set
    last_visit_at = case
      when new.activity_at is not null
        and (f.last_visit_at is null or new.activity_at > f.last_visit_at)
      then new.activity_at
      else f.last_visit_at
    end,
    next_follow_up_at = case
      when new.next_follow_up_at is not null
      then new.next_follow_up_at
      else f.next_follow_up_at
    end
  where f.id = new.facility_id;
  return new;
end;
$$;

drop trigger if exists facility_activities_sync_facility on public.facility_activities;
create trigger facility_activities_sync_facility
  after insert on public.facility_activities
  for each row
  execute function public.facility_activities_after_insert_sync_facility();

-- RLS: same staff pattern as CRM foundation (manager / admin / super_admin).

alter table public.facilities enable row level security;
alter table public.facility_contacts enable row level security;
alter table public.facility_activities enable row level security;

drop policy if exists "facilities_select_staff" on public.facilities;
create policy "facilities_select_staff"
  on public.facilities for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facilities_insert_staff" on public.facilities;
create policy "facilities_insert_staff"
  on public.facilities for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facilities_update_staff" on public.facilities;
create policy "facilities_update_staff"
  on public.facilities for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facilities_delete_staff" on public.facilities;
create policy "facilities_delete_staff"
  on public.facilities for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_contacts_select_staff" on public.facility_contacts;
create policy "facility_contacts_select_staff"
  on public.facility_contacts for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_contacts_insert_staff" on public.facility_contacts;
create policy "facility_contacts_insert_staff"
  on public.facility_contacts for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_contacts_update_staff" on public.facility_contacts;
create policy "facility_contacts_update_staff"
  on public.facility_contacts for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_contacts_delete_staff" on public.facility_contacts;
create policy "facility_contacts_delete_staff"
  on public.facility_contacts for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_activities_select_staff" on public.facility_activities;
create policy "facility_activities_select_staff"
  on public.facility_activities for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_activities_insert_staff" on public.facility_activities;
create policy "facility_activities_insert_staff"
  on public.facility_activities for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_activities_update_staff" on public.facility_activities;
create policy "facility_activities_update_staff"
  on public.facility_activities for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_activities_delete_staff" on public.facility_activities;
create policy "facility_activities_delete_staff"
  on public.facility_activities for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
