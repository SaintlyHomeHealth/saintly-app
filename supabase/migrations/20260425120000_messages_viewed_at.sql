-- Inbound SMS read state: staff "opens thread" sets viewed_at on inbound rows.

alter table public.messages
  add column if not exists viewed_at timestamptz null;

comment on column public.messages.viewed_at is
  'When staff first saw this inbound message in the thread UI; null = unread. Outbound rows unused.';

-- Historical inbound: treat as already read so we do not flood the inbox.
update public.messages
set viewed_at = created_at
where direction = 'inbound' and viewed_at is null;

create index if not exists messages_unread_inbound_idx
  on public.messages (conversation_id)
  where direction = 'inbound' and viewed_at is null;
