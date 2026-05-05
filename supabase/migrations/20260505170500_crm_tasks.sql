-- CRM tasks for admin/staff workflows (Saintly Tasks + AI voice follow-ups).

create table if not exists public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'blocked', 'done', 'canceled')),
  priority text not null default 'normal'
    check (priority in ('low', 'normal', 'high', 'urgent')),
  due_at timestamptz,
  related_entity_type text
    check (
      related_entity_type is null
      or related_entity_type in ('lead', 'recruit', 'employee', 'facility', 'patient', 'insurance_payer', 'general')
    ),
  related_entity_id uuid,
  assigned_to uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  source text not null default 'manual'
    check (source in ('manual', 'ai_voice_transcription', 'ai_realtime')),
  ai_transcript text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists crm_tasks_status_idx on public.crm_tasks (status);

create index if not exists crm_tasks_due_at_idx on public.crm_tasks (due_at);

create index if not exists crm_tasks_priority_idx on public.crm_tasks (priority);

create index if not exists crm_tasks_assigned_to_idx on public.crm_tasks (assigned_to);

create index if not exists crm_tasks_related_entity_idx
  on public.crm_tasks (related_entity_type, related_entity_id);

create index if not exists crm_tasks_created_at_desc_idx on public.crm_tasks (created_at desc);

drop trigger if exists crm_tasks_updated_at on public.crm_tasks;
create trigger crm_tasks_updated_at
  before update on public.crm_tasks
  for each row
  execute function public.touch_crm_leads_updated_at();

alter table public.crm_tasks enable row level security;

drop policy if exists "crm_tasks_select_staff" on public.crm_tasks;
create policy "crm_tasks_select_staff"
  on public.crm_tasks for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "crm_tasks_insert_staff" on public.crm_tasks;
create policy "crm_tasks_insert_staff"
  on public.crm_tasks for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

drop policy if exists "crm_tasks_update_staff" on public.crm_tasks;
create policy "crm_tasks_update_staff"
  on public.crm_tasks for update to authenticated
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

drop policy if exists "crm_tasks_delete_staff" on public.crm_tasks;
create policy "crm_tasks_delete_staff"
  on public.crm_tasks for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );
