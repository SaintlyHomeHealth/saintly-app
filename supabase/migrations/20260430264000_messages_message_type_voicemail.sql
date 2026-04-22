-- Distinguish SMS bubbles from voicemail thread items (see `ensureVoicemailThreadMessage`).

alter table public.messages
  add column if not exists message_type text not null default 'sms';

comment on column public.messages.message_type is
  'sms = normal SMS; voicemail = inbound voicemail card linked via phone_call_id.';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'messages_message_type_check'
  ) then
    alter table public.messages
      add constraint messages_message_type_check
      check (message_type in ('sms', 'voicemail'));
  end if;
end $$;

create unique index if not exists messages_one_voicemail_per_call_uidx
  on public.messages (phone_call_id)
  where message_type = 'voicemail' and phone_call_id is not null;

create index if not exists messages_voicemail_cleanup_idx
  on public.messages (deleted_at)
  where message_type = 'voicemail' and deleted_at is not null;
