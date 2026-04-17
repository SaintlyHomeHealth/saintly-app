-- Inbound ring groups: per-user membership (admin UI); env vars remain fallback when a group has no DB rows.

create table if not exists public.inbound_ring_group_memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  ring_group_key text not null,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inbound_ring_group_memberships_ring_group_key_check check (
    ring_group_key in ('intake', 'admin', 'billing', 'on_call')
  ),
  constraint inbound_ring_group_memberships_user_group_unique unique (user_id, ring_group_key)
);

create index if not exists inbound_ring_group_memberships_user_id_idx
  on public.inbound_ring_group_memberships (user_id);

create index if not exists inbound_ring_group_memberships_group_key_idx
  on public.inbound_ring_group_memberships (ring_group_key)
  where is_enabled = true;

drop trigger if exists inbound_ring_group_memberships_updated_at on public.inbound_ring_group_memberships;
create trigger inbound_ring_group_memberships_updated_at
  before update on public.inbound_ring_group_memberships
  for each row
  execute function public.touch_conversations_updated_at();

alter table public.inbound_ring_group_memberships enable row level security;

-- No policies: deny direct client access; server uses service role for reads/writes.

alter table public.staff_profiles
  add column if not exists inbound_ring_primary_group_key text;

alter table public.staff_profiles
  drop constraint if exists staff_profiles_inbound_ring_primary_group_key_check;

alter table public.staff_profiles
  add constraint staff_profiles_inbound_ring_primary_group_key_check check (
    inbound_ring_primary_group_key is null
    or inbound_ring_primary_group_key in ('intake', 'admin', 'billing', 'on_call')
  );

comment on table public.inbound_ring_group_memberships is
  'Per-auth-user inbound ring group membership; routing prefers DB over env when any eligible member exists per group.';
comment on column public.staff_profiles.inbound_ring_primary_group_key is
  'Optional primary queue label for UI; routing still uses merged group order.';
