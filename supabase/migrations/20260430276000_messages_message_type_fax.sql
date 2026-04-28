-- Allow fax cards in the existing conversation message stream.

alter table public.messages
  drop constraint if exists messages_message_type_check;

alter table public.messages
  add constraint messages_message_type_check
  check (message_type in ('sms', 'voicemail', 'fax'));

comment on column public.messages.message_type is
  'sms = normal SMS; voicemail = inbound voicemail card linked via phone_call_id; fax = inbound/outbound fax card linked through metadata.fax.';

create index if not exists messages_fax_cleanup_idx
  on public.messages (deleted_at)
  where message_type = 'fax' and deleted_at is not null;
