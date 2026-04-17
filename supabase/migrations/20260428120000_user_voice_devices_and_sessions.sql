-- Mobile Voice: `devices` + per-user `call_sessions` for multi-device ringing sync (Dialpad-style).
-- Replaces stub `user_voice_devices` with `devices`. Keeps legacy `voice_call_sessions` (global row per CallSid).

drop table if exists public.user_voice_devices cascade;

-- ---------------------------------------------------------------------------
-- devices: one row per physical app install; push tokens + Twilio identity
-- ---------------------------------------------------------------------------
create table public.devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  platform text not null,
  fcm_token text,
  voip_token text,
  twilio_identity text not null,
  device_install_id text,
  last_seen_at timestamptz not null default now(),
  is_active boolean not null default true,
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint devices_platform_check check (platform in ('ios', 'android'))
);

create unique index devices_user_install_unique
  on public.devices (user_id, device_install_id)
  where device_install_id is not null;

create unique index devices_user_fcm_unique
  on public.devices (user_id, fcm_token)
  where fcm_token is not null;

create index devices_user_id_idx on public.devices (user_id);
create index devices_twilio_identity_idx on public.devices (twilio_identity);
create index devices_last_seen_idx on public.devices (last_seen_at desc);

drop trigger if exists devices_updated_at on public.devices;
create trigger devices_updated_at
  before update on public.devices
  for each row
  execute function public.touch_conversations_updated_at();

alter table public.devices enable row level security;

drop policy if exists "devices_select_own" on public.devices;
create policy "devices_select_own"
  on public.devices
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "devices_insert_own" on public.devices;
create policy "devices_insert_own"
  on public.devices
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "devices_update_own" on public.devices;
create policy "devices_update_own"
  on public.devices
  for update
  to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists "devices_delete_own" on public.devices;
create policy "devices_delete_own"
  on public.devices
  for delete
  to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- call_sessions: one row per (Twilio CallSid, user) — all devices for that user share state via Realtime
-- ---------------------------------------------------------------------------
create table public.call_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  call_sid text not null,
  phone_call_id uuid references public.phone_calls (id) on delete set null,
  status text not null,
  started_at timestamptz not null default now(),
  ring_expires_at timestamptz not null default (now() + interval '30 seconds'),
  answered_at timestamptz,
  ended_at timestamptz,
  answered_by_device_id uuid references public.devices (id) on delete set null,
  from_e164 text,
  to_e164 text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_sessions_status_check check (
    status in ('ringing', 'answered', 'declined', 'missed', 'ended')
  ),
  constraint call_sessions_call_sid_user_unique unique (call_sid, user_id)
);

create index call_sessions_user_id_created_idx
  on public.call_sessions (user_id, created_at desc);

create index call_sessions_call_sid_idx on public.call_sessions (call_sid);

drop trigger if exists call_sessions_updated_at on public.call_sessions;
create trigger call_sessions_updated_at
  before update on public.call_sessions
  for each row
  execute function public.touch_conversations_updated_at();

alter table public.call_sessions enable row level security;

-- Clients only read their own sessions (insert/update from service role or RPC).
drop policy if exists "call_sessions_select_own" on public.call_sessions;
create policy "call_sessions_select_own"
  on public.call_sessions
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Realtime: mobile subscribes with filter user_id=eq.<auth uid>
do $pub$
begin
  alter publication supabase_realtime add table public.call_sessions;
exception
  when duplicate_object then null;
end
$pub$;

-- ---------------------------------------------------------------------------
-- Atomic answer: first device wins; ignores stale rows after ring_expires_at
-- ---------------------------------------------------------------------------
create or replace function public.answer_call_session(p_session_id uuid, p_device_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.call_sessions;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  if not exists (
    select 1 from public.devices d
    where d.id = p_device_id and d.user_id = uid
  ) then
    return jsonb_build_object('ok', false, 'error', 'invalid_device');
  end if;

  update public.call_sessions cs
  set
    status = 'answered',
    answered_at = now(),
    answered_by_device_id = p_device_id,
    ended_at = null
  where cs.id = p_session_id
    and cs.user_id = uid
    and cs.status = 'ringing'
    and now() <= cs.ring_expires_at
  returning * into r;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;

  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', r.id,
      'call_sid', r.call_sid,
      'status', r.status,
      'phone_call_id', r.phone_call_id,
      'answered_at', r.answered_at,
      'answered_by_device_id', r.answered_by_device_id
    )
  );
end;
$$;

grant execute on function public.answer_call_session(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Decline: any device for that user can end the ring for all their devices (same row)
-- ---------------------------------------------------------------------------
create or replace function public.decline_call_session(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  r public.call_sessions;
begin
  if uid is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  update public.call_sessions cs
  set
    status = 'declined',
    ended_at = now()
  where cs.id = p_session_id
    and cs.user_id = uid
    and cs.status = 'ringing'
    and now() <= cs.ring_expires_at
  returning * into r;

  if r.id is null then
    return jsonb_build_object('ok', false, 'error', 'not_eligible');
  end if;

  return jsonb_build_object(
    'ok', true,
    'session', jsonb_build_object(
      'id', r.id,
      'call_sid', r.call_sid,
      'status', r.status,
      'ended_at', r.ended_at
    )
  );
end;
$$;

grant execute on function public.decline_call_session(uuid) to authenticated;

-- Legacy global session row (workspace/mobile/voice/call-event + syncVoiceCallSessionFromPhoneStatus).
create table if not exists public.voice_call_sessions (
  id uuid primary key default gen_random_uuid(),
  external_call_id text not null,
  phone_call_id uuid references public.phone_calls (id) on delete set null,
  state text not null,
  from_e164 text,
  to_e164 text,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint voice_call_sessions_state_check check (
    state in ('ringing', 'answered', 'declined', 'caller_hung_up', 'missed', 'completed', 'unknown')
  ),
  constraint voice_call_sessions_external_unique unique (external_call_id)
);

create index if not exists voice_call_sessions_phone_call_id_idx
  on public.voice_call_sessions (phone_call_id);

create index if not exists voice_call_sessions_state_idx
  on public.voice_call_sessions (state);

drop trigger if exists voice_call_sessions_updated_at on public.voice_call_sessions;
create trigger voice_call_sessions_updated_at
  before update on public.voice_call_sessions
  for each row
  execute function public.touch_conversations_updated_at();

alter table public.voice_call_sessions enable row level security;
