-- AI-generated post-call artifacts (SOAP, summary, intake) tied to phone_calls.
-- Writes via service role in API routes; staff SELECT for future in-app reads.

create table if not exists public.call_outputs (
  id uuid primary key default gen_random_uuid(),
  phone_call_id uuid not null references public.phone_calls (id) on delete cascade,
  type text not null check (type in ('soap', 'summary', 'intake')),
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (phone_call_id, type)
);

create index if not exists call_outputs_phone_call_id_idx
  on public.call_outputs (phone_call_id);

create or replace function public.touch_call_outputs_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists call_outputs_updated_at on public.call_outputs;
create trigger call_outputs_updated_at
  before update on public.call_outputs
  for each row
  execute function public.touch_call_outputs_updated_at();

alter table public.call_outputs enable row level security;

drop policy if exists "call_outputs_select_staff" on public.call_outputs;
create policy "call_outputs_select_staff"
  on public.call_outputs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('super_admin', 'admin', 'manager', 'nurse')
    )
  );

comment on table public.call_outputs is
  'Staff-edited AI outputs from call transcripts; one row per type per call (upsert).';
