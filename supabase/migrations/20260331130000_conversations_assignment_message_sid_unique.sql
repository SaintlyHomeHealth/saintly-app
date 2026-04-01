-- Phase 2 SMS: conversation assignment (mirror phone_calls ownership model) + idempotent inbound by Twilio MessageSid.

alter table public.conversations
  add column if not exists assigned_to_user_id uuid references auth.users (id) on delete set null;

alter table public.conversations
  add column if not exists assigned_at timestamptz;

create index if not exists conversations_assigned_to_user_id_idx
  on public.conversations (assigned_to_user_id)
  where assigned_to_user_id is not null;

create unique index if not exists messages_external_message_sid_unique
  on public.messages (external_message_sid)
  where external_message_sid is not null;
