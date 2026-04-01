-- Lightweight follow-up tasks tied to phone_calls (CRM).

create table if not exists public.phone_call_tasks (
  id uuid primary key default gen_random_uuid(),
  phone_call_id uuid not null references public.phone_calls (id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'open',
  priority text not null default 'normal',
  due_at timestamptz,
  completed_at timestamptz,
  assigned_to_user_id uuid references auth.users (id) on delete set null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phone_call_tasks_status_check check (
    status in ('open', 'in_progress', 'completed', 'canceled')
  ),
  constraint phone_call_tasks_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  )
);

create index if not exists phone_call_tasks_phone_call_id_idx
  on public.phone_call_tasks (phone_call_id);

create index if not exists phone_call_tasks_assigned_status_idx
  on public.phone_call_tasks (assigned_to_user_id, status);

create index if not exists phone_call_tasks_status_due_open_idx
  on public.phone_call_tasks (status, due_at)
  where status <> 'completed';

create or replace function public.touch_phone_call_tasks_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists phone_call_tasks_updated_at on public.phone_call_tasks;
create trigger phone_call_tasks_updated_at
  before update on public.phone_call_tasks
  for each row
  execute function public.touch_phone_call_tasks_updated_at();

alter table public.phone_call_tasks enable row level security;

drop policy if exists "phone_call_tasks_select_staff" on public.phone_call_tasks;
create policy "phone_call_tasks_select_staff"
  on public.phone_call_tasks
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('admin', 'super_admin', 'manager')
    )
  );
