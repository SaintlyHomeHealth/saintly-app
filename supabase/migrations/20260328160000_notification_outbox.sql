-- Notification foundation: outbox + delivery attempt log (enqueue-only phase; no sending yet).

create table if not exists public.notification_outbox (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source text not null,
  dedupe_key text not null,
  status text not null default 'pending',
  recipient_kind text not null,
  recipient_email text,
  recipient_phone text,
  recipient_user_id uuid,
  payload jsonb not null default '{}'::jsonb,
  scheduled_for timestamptz,
  not_before timestamptz,
  constraint notification_outbox_dedupe_key_unique unique (dedupe_key),
  constraint notification_outbox_status_check check (
    status in ('pending', 'processing', 'sent', 'failed', 'cancelled', 'suppressed')
  )
);

create index if not exists notification_outbox_status_scheduled_idx
  on public.notification_outbox (status, scheduled_for nulls last);

create index if not exists notification_outbox_source_created_idx
  on public.notification_outbox (source, created_at desc);

create table if not exists public.notification_delivery_attempt (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  outbox_id uuid not null references public.notification_outbox (id) on delete cascade,
  channel text not null,
  status text not null,
  provider_message_id text,
  error text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists notification_delivery_attempt_outbox_idx
  on public.notification_delivery_attempt (outbox_id);

create or replace function public.touch_notification_outbox_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists notification_outbox_updated_at on public.notification_outbox;
create trigger notification_outbox_updated_at
  before update on public.notification_outbox
  for each row
  execute function public.touch_notification_outbox_updated_at();

alter table public.notification_outbox enable row level security;
alter table public.notification_delivery_attempt enable row level security;

-- No policies: authenticated clients do not access these tables.
-- Service role (backend) bypasses RLS for enqueue and future workers.
