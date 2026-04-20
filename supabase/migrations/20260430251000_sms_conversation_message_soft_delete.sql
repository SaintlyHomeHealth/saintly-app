-- Soft-delete for SMS inbox: hide threads/messages in UI while retaining rows for audit/CRM history.

alter table public.conversations
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid;

alter table public.messages
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by_user_id uuid;

comment on column public.conversations.deleted_at is
  'When set, conversation is hidden from inbox lists; inbound can revive the row (see app ensureSmsConversationForPhone).';
comment on column public.conversations.deleted_by_user_id is 'Staff user who soft-deleted the conversation, if known.';
comment on column public.messages.deleted_at is 'When set, message is hidden from thread UI.';
comment on column public.messages.deleted_by_user_id is 'Staff user who soft-deleted the message, if known.';

create index if not exists conversations_sms_inbox_list_idx
  on public.conversations (last_message_at desc nulls last)
  where channel = 'sms' and deleted_at is null;

create index if not exists messages_conversation_active_idx
  on public.messages (conversation_id, created_at desc)
  where deleted_at is null;
