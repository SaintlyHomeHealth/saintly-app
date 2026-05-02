-- Private HIPAA-oriented attachments for internal chat (metadata + storage in `chat-attachments`).

insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

create table if not exists public.chat_message_attachments (
  id uuid primary key default gen_random_uuid(),
  chat_message_id uuid not null references public.internal_chat_messages (id) on delete cascade,
  chat_thread_id uuid not null references public.internal_chats (id) on delete cascade,
  storage_bucket text not null default 'chat-attachments',
  storage_path text not null,
  file_name text not null,
  content_type text not null,
  size_bytes bigint,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists chat_message_attachments_message_idx
  on public.chat_message_attachments (chat_message_id);

create index if not exists chat_message_attachments_thread_idx
  on public.chat_message_attachments (chat_thread_id);

create index if not exists chat_message_attachments_created_at_idx
  on public.chat_message_attachments (created_at desc);

comment on table public.chat_message_attachments is
  'Internal chat files in private storage; access via app routes + signed URLs.';

create or replace function public.chat_message_attachments_thread_match()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1
    from public.internal_chat_messages m
    where m.id = new.chat_message_id
      and m.chat_id = new.chat_thread_id
  ) then
    raise exception 'chat_thread_id must match internal_chat_messages.chat_id';
  end if;
  return new;
end;
$$;

drop trigger if exists chat_message_attachments_thread_match on public.chat_message_attachments;
create trigger chat_message_attachments_thread_match
  before insert or update on public.chat_message_attachments
  for each row
  execute function public.chat_message_attachments_thread_match();

alter table public.chat_message_attachments enable row level security;

drop policy if exists "chat_message_attachments_select" on public.chat_message_attachments;
create policy "chat_message_attachments_select"
  on public.chat_message_attachments
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.internal_chat_members m
      where m.chat_id = chat_message_attachments.chat_thread_id
        and m.user_id = (select auth.uid())
    )
    or exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.is_active is distinct from false
        and sp.role in ('super_admin', 'admin')
    )
  );

drop policy if exists "chat_attachments_storage_select" on storage.objects;
create policy "chat_attachments_storage_select"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.internal_chat_members m
      where m.user_id = (select auth.uid())
        and m.chat_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "chat_attachments_storage_insert" on storage.objects;
create policy "chat_attachments_storage_insert"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.internal_chat_members m
      where m.user_id = (select auth.uid())
        and m.member_role <> 'read_only'
        and m.chat_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "chat_attachments_storage_delete" on storage.objects;
create policy "chat_attachments_storage_delete"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and exists (
      select 1
      from public.internal_chat_members m
      where m.user_id = (select auth.uid())
        and m.member_role = 'admin'
        and m.chat_id::text = (storage.foldername(name))[1]
    )
  );

alter publication supabase_realtime add table public.chat_message_attachments;
