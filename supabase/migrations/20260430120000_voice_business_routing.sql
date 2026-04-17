-- Deterministic inbound voice routing metadata (dashboards, callback sorting, ops reporting).

alter table public.voice_call_sessions
  add column if not exists routing_json jsonb not null default '{}'::jsonb,
  add column if not exists route_type text,
  add column if not exists ring_group_id text,
  add column if not exists after_hours boolean not null default false,
  add column if not exists callback_priority smallint;

create index if not exists voice_call_sessions_route_type_idx
  on public.voice_call_sessions (route_type)
  where route_type is not null;

create index if not exists voice_call_sessions_callback_priority_idx
  on public.voice_call_sessions (callback_priority)
  where callback_priority is not null;

alter table public.phone_calls
  add column if not exists inbound_route_type text,
  add column if not exists inbound_ring_group_id text,
  add column if not exists after_hours boolean,
  add column if not exists callback_priority smallint;

create index if not exists phone_calls_inbound_route_type_idx
  on public.phone_calls (inbound_route_type)
  where inbound_route_type is not null;

create index if not exists phone_calls_callback_priority_idx
  on public.phone_calls (callback_priority)
  where callback_priority is not null;
