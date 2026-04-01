-- Phase 0 phone foundation: call rows, append-only events, voicemail placeholder.
-- Writes: service role (webhooks). Reads: admin / super_admin (matches notification_outbox pattern).

create table if not exists public.phone_calls (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  external_call_id text not null,
  direction text not null default 'inbound',
  from_e164 text,
  to_e164 text,
  status text not null default 'unknown',
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer,
  metadata jsonb not null default '{}'::jsonb,
  constraint phone_calls_external_call_id_unique unique (external_call_id),
  constraint phone_calls_direction_check check (direction in ('inbound', 'outbound')),
  constraint phone_calls_status_check check (
    status in (
      'unknown',
      'ringing',
      'in_progress',
      'completed',
      'missed',
      'voicemail',
      'failed',
      'cancelled'
    )
  )
);

create index if not exists phone_calls_created_at_idx on public.phone_calls (created_at desc);
create index if not exists phone_calls_status_idx on public.phone_calls (status);

create table if not exists public.phone_call_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  call_id uuid not null references public.phone_calls (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists phone_call_events_call_created_idx
  on public.phone_call_events (call_id, created_at desc);

-- Voicemail placeholder: recording path / transcription filled in a later phase.
create table if not exists public.phone_voicemails (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  call_id uuid references public.phone_calls (id) on delete set null,
  duration_seconds integer,
  storage_path text,
  transcription_status text not null default 'none',
  metadata jsonb not null default '{}'::jsonb,
  constraint phone_voicemails_transcription_status_check check (
    transcription_status in ('none', 'pending', 'ready', 'failed')
  )
);

create index if not exists phone_voicemails_created_at_idx on public.phone_voicemails (created_at desc);
create index if not exists phone_voicemails_call_id_idx on public.phone_voicemails (call_id);

create or replace function public.touch_phone_calls_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists phone_calls_updated_at on public.phone_calls;
create trigger phone_calls_updated_at
  before update on public.phone_calls
  for each row
  execute function public.touch_phone_calls_updated_at();

alter table public.phone_calls enable row level security;
alter table public.phone_call_events enable row level security;
alter table public.phone_voicemails enable row level security;

-- Authenticated clients do not insert/update phone tables (webhooks use service role).

drop policy if exists "phone_calls_select_admin" on public.phone_calls;
create policy "phone_calls_select_admin"
  on public.phone_calls
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "phone_call_events_select_admin" on public.phone_call_events;
create policy "phone_call_events_select_admin"
  on public.phone_call_events
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "phone_voicemails_select_admin" on public.phone_voicemails;
create policy "phone_voicemails_select_admin"
  on public.phone_voicemails
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );
