-- MMS / picture messaging private storage + metadata linked to inbox messages.

insert into storage.buckets (id, name, public)
values ('phone-message-media', 'phone-message-media', false)
on conflict (id) do nothing;

create table if not exists public.phone_message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages (id) on delete cascade,
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  provider text not null default 'twilio',
  provider_message_sid text,
  provider_media_index integer not null default 0,
  provider_media_url text,
  content_type text not null default 'application/octet-stream',
  file_name text not null,
  storage_bucket text not null default 'phone-message-media',
  storage_path text not null,
  size_bytes bigint,
  created_at timestamptz not null default now(),
  constraint phone_message_attachments_provider_media_position_key
    unique (provider_message_sid, provider_media_index)
);

create index if not exists phone_message_attachments_message_idx
  on public.phone_message_attachments (message_id);

create index if not exists phone_message_attachments_conversation_idx
  on public.phone_message_attachments (conversation_id, created_at desc);

comment on table public.phone_message_attachments is
  'Twilio MMS (and similar) blobs stored privately; keyed to messages.external_message_sid for webhook idempotency.';

alter table public.phone_message_attachments enable row level security;

drop policy if exists "phone_message_attachments_select_staff" on public.phone_message_attachments;

create policy "phone_message_attachments_select_staff"
  on public.phone_message_attachments for select to authenticated
  using (
    exists (
      select 1 from public.messages m
      where m.id = phone_message_attachments.message_id
        and m.deleted_at is null
    )
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.is_active is distinct from false
        and sp.role <> 'read_only'
        and sp.role in (
          'super_admin',
          'admin',
          'manager',
          'nurse',
          'don',
          'recruiter',
          'billing',
          'dispatch',
          'credentialing'
        )
    )
    and (
      public.staff_has_full_phone_visibility()
      or exists (
        select 1 from public.messages m
        where m.id = phone_message_attachments.message_id
          and m.owner_user_id is not null
          and m.owner_user_id = auth.uid()
      )
    )
  );

alter publication supabase_realtime add table public.phone_message_attachments;
