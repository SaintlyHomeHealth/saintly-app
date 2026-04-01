-- Inbox foundation for future SMS; no app UI or Twilio wiring in Phase 1.

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  channel text not null default 'sms',
  primary_contact_id uuid references public.contacts (id) on delete set null,
  main_phone_e164 text,
  external_thread_id text,
  last_message_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  constraint conversations_channel_check check (channel in ('sms'))
);

create index if not exists conversations_last_message_at_idx
  on public.conversations (last_message_at desc nulls last);

create index if not exists conversations_main_phone_e164_idx
  on public.conversations (main_phone_e164)
  where main_phone_e164 is not null and trim(main_phone_e164) <> '';

create index if not exists conversations_primary_contact_id_idx
  on public.conversations (primary_contact_id)
  where primary_contact_id is not null;

create or replace function public.touch_conversations_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists conversations_updated_at on public.conversations;
create trigger conversations_updated_at
  before update on public.conversations
  for each row
  execute function public.touch_conversations_updated_at();

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null,
  body text not null default '',
  phone_call_id uuid references public.phone_calls (id) on delete set null,
  external_message_sid text,
  metadata jsonb not null default '{}'::jsonb,
  constraint messages_direction_check check (direction in ('inbound', 'outbound'))
);

create index if not exists messages_conversation_created_idx
  on public.messages (conversation_id, created_at desc);

create index if not exists messages_phone_call_id_idx
  on public.messages (phone_call_id)
  where phone_call_id is not null;

alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conversations_select_staff" on public.conversations;
create policy "conversations_select_staff"
  on public.conversations
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('super_admin', 'admin', 'manager', 'nurse')
    )
  );

drop policy if exists "messages_select_staff" on public.messages;
create policy "messages_select_staff"
  on public.messages
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('super_admin', 'admin', 'manager', 'nurse')
    )
  );
