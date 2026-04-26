-- Performance helpers for SMS inbox scoping and high-use admin list filters.
-- Non-destructive: adds a read-only helper function and indexes only.

create or replace function public.sms_conversation_ids_with_messages(conversation_ids uuid[])
returns table (conversation_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select distinct m.conversation_id
  from public.messages m
  where m.conversation_id = any (conversation_ids)
    and m.message_type = 'sms'
    and m.deleted_at is null;
$$;

grant execute on function public.sms_conversation_ids_with_messages(uuid[]) to authenticated, service_role;

create index if not exists messages_conversation_sms_active_idx
  on public.messages (conversation_id)
  where message_type = 'sms' and deleted_at is null;

create index if not exists leads_status_created_active_idx
  on public.leads (status, created_at desc)
  where deleted_at is null;

create index if not exists leads_source_created_active_idx
  on public.leads (source, created_at desc)
  where deleted_at is null;

create index if not exists leads_owner_created_active_idx
  on public.leads (owner_user_id, created_at desc)
  where owner_user_id is not null and deleted_at is null;

create index if not exists leads_service_disciplines_gin_idx
  on public.leads using gin (service_disciplines);

create index if not exists applicants_created_at_idx
  on public.applicants (created_at desc);

create index if not exists applicants_status_created_idx
  on public.applicants (status, created_at desc);
