-- Facility follow-up tasks for field sales outreach.

create table if not exists public.facility_follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  activity_id uuid null references public.facility_activities (id) on delete set null,
  contact_id uuid null references public.facility_contacts (id) on delete set null,
  assigned_to uuid null references auth.users (id) on delete set null,
  title text not null,
  description text null,
  due_at timestamptz not null,
  status text not null default 'open',
  priority text null,
  source text null,
  completed_at timestamptz null,
  completed_by uuid null references auth.users (id) on delete set null,
  completion_note text null,
  snoozed_until timestamptz null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_follow_up_tasks_status_check
    check (status in ('open', 'completed', 'snoozed', 'canceled')),
  constraint facility_follow_up_tasks_priority_check
    check (priority is null or priority in ('Low', 'Normal', 'High')),
  constraint facility_follow_up_tasks_source_check
    check (
      source is null
      or source in ('quick_log', 'ai_capture', 'manual', 'photo_note', 'advanced_log')
    )
);

create index if not exists facility_follow_up_tasks_facility_id_idx
  on public.facility_follow_up_tasks (facility_id);

create index if not exists facility_follow_up_tasks_assigned_to_idx
  on public.facility_follow_up_tasks (assigned_to);

create index if not exists facility_follow_up_tasks_due_at_idx
  on public.facility_follow_up_tasks (due_at);

create index if not exists facility_follow_up_tasks_status_idx
  on public.facility_follow_up_tasks (status);

create index if not exists facility_follow_up_tasks_created_at_idx
  on public.facility_follow_up_tasks (created_at desc);

comment on table public.facility_follow_up_tasks is
  'Actionable follow-up tasks for facility outreach; synced from Quick Log, AI Capture, and manual entry.';

create or replace function public.touch_facility_follow_up_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists facility_follow_up_tasks_updated_at on public.facility_follow_up_tasks;
create trigger facility_follow_up_tasks_updated_at
  before update on public.facility_follow_up_tasks
  for each row
  execute function public.touch_facility_follow_up_tasks_updated_at();

alter table public.facility_follow_up_tasks enable row level security;

drop policy if exists "facility_follow_up_tasks_select_staff" on public.facility_follow_up_tasks;
create policy "facility_follow_up_tasks_select_staff"
  on public.facility_follow_up_tasks for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_follow_up_tasks_insert_staff" on public.facility_follow_up_tasks;
create policy "facility_follow_up_tasks_insert_staff"
  on public.facility_follow_up_tasks for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "facility_follow_up_tasks_update_staff" on public.facility_follow_up_tasks;
create policy "facility_follow_up_tasks_update_staff"
  on public.facility_follow_up_tasks for update to authenticated
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

drop policy if exists "facility_follow_up_tasks_delete_staff" on public.facility_follow_up_tasks;
create policy "facility_follow_up_tasks_delete_staff"
  on public.facility_follow_up_tasks for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
