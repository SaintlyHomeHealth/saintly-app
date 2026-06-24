-- Email Marketing → Shared CRM Inbox (admin@saintlyhomehealth.com via Gmail API).

create table if not exists public.email_mailboxes (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'gmail',
  email_address text not null unique,
  display_name text,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'disconnected', 'error')),
  oauth_refresh_token text,
  last_sync_at timestamptz,
  last_history_id text,
  sync_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_mailboxes_status_idx on public.email_mailboxes (status, email_address);

create table if not exists public.email_threads (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.email_mailboxes (id) on delete cascade,
  gmail_thread_id text unique,
  subject text not null default '',
  normalized_subject text not null default '',
  last_message_at timestamptz,
  last_message_preview text,
  participant_emails text[] not null default '{}',
  participant_names text[] not null default '{}',
  assigned_to uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  status text not null default 'open'
    check (status in ('open', 'archived', 'closed')),
  category text,
  linked_referral_source_id uuid,
  linked_lead_id uuid references public.leads (id) on delete set null,
  linked_patient_id uuid references public.patients (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_threads_mailbox_last_message_idx
  on public.email_threads (mailbox_id, last_message_at desc nulls last);
create index if not exists email_threads_assigned_to_idx
  on public.email_threads (assigned_to) where assigned_to is not null;
create index if not exists email_threads_status_idx on public.email_threads (status, last_message_at desc);

create table if not exists public.email_messages (
  id uuid primary key default gen_random_uuid(),
  mailbox_id uuid not null references public.email_mailboxes (id) on delete cascade,
  thread_id uuid references public.email_threads (id) on delete cascade,
  gmail_message_id text unique,
  gmail_thread_id text,
  direction text not null check (direction in ('inbound', 'outbound')),
  from_email text not null,
  from_name text,
  to_emails text[] not null default '{}',
  cc_emails text[] not null default '{}',
  bcc_emails text[] not null default '{}',
  subject text not null default '',
  body_text text not null default '',
  body_html text,
  snippet text,
  message_id_header text,
  in_reply_to_header text,
  references_header text,
  gmail_internal_date timestamptz,
  sent_by_user_id uuid references auth.users (id) on delete set null,
  sender_profile_id uuid references public.email_sender_profiles (id) on delete set null,
  custom_sender_name text,
  custom_sender_title text,
  custom_sender_phone text,
  custom_sender_email text,
  template_id uuid references public.email_marketing_templates (id) on delete set null,
  flyer_id uuid references public.email_marketing_flyers (id) on delete set null,
  read_at timestamptz,
  archived_at timestamptz,
  has_attachments boolean not null default false,
  raw_headers jsonb not null default '{}',
  status text not null default 'received'
    check (status in ('draft', 'queued', 'sending', 'sent', 'received', 'failed')),
  provider text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_messages_thread_created_idx
  on public.email_messages (thread_id, gmail_internal_date asc nulls last, created_at asc);
create index if not exists email_messages_mailbox_direction_idx
  on public.email_messages (mailbox_id, direction, created_at desc);
create index if not exists email_messages_sent_by_idx
  on public.email_messages (sent_by_user_id, created_at desc) where sent_by_user_id is not null;
create index if not exists email_messages_unread_idx
  on public.email_messages (thread_id, read_at) where direction = 'inbound' and read_at is null;

create table if not exists public.email_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.email_messages (id) on delete cascade,
  gmail_attachment_id text,
  file_name text not null,
  mime_type text not null default 'application/octet-stream',
  size_bytes bigint,
  storage_path text,
  public_url text,
  created_at timestamptz not null default now()
);

create index if not exists email_attachments_message_id_idx on public.email_attachments (message_id);

insert into storage.buckets (id, name, public)
values ('email-inbox-attachments', 'email-inbox-attachments', false)
on conflict (id) do nothing;

-- Default admin@ shared mailbox (Gmail OAuth connects separately).
insert into public.email_mailboxes (provider, email_address, display_name, status)
values ('gmail', 'admin@saintlyhomehealth.com', 'Saintly Home Health Admin', 'pending')
on conflict (email_address) do nothing;

drop trigger if exists email_mailboxes_updated_at on public.email_mailboxes;
create trigger email_mailboxes_updated_at
  before update on public.email_mailboxes
  for each row execute function public.touch_email_marketing_updated_at();

drop trigger if exists email_threads_updated_at on public.email_threads;
create trigger email_threads_updated_at
  before update on public.email_threads
  for each row execute function public.touch_email_marketing_updated_at();

drop trigger if exists email_messages_updated_at on public.email_messages;
create trigger email_messages_updated_at
  before update on public.email_messages
  for each row execute function public.touch_email_marketing_updated_at();

alter table public.email_mailboxes enable row level security;
alter table public.email_threads enable row level security;
alter table public.email_messages enable row level security;
alter table public.email_attachments enable row level security;

-- Staff with email_marketing access can read admin@ inbox data.
drop policy if exists "email_mailboxes_select_staff" on public.email_mailboxes;
create policy "email_mailboxes_select_staff"
  on public.email_mailboxes for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "email_mailboxes_write_admin" on public.email_mailboxes;
create policy "email_mailboxes_write_admin"
  on public.email_mailboxes for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "email_threads_select_staff" on public.email_threads;
create policy "email_threads_select_staff"
  on public.email_threads for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "email_threads_write_staff" on public.email_threads;
create policy "email_threads_write_staff"
  on public.email_threads for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "email_messages_select_staff" on public.email_messages;
create policy "email_messages_select_staff"
  on public.email_messages for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "email_messages_write_staff" on public.email_messages;
create policy "email_messages_write_staff"
  on public.email_messages for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "email_attachments_select_staff" on public.email_attachments;
create policy "email_attachments_select_staff"
  on public.email_attachments for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "email_attachments_write_staff" on public.email_attachments;
create policy "email_attachments_write_staff"
  on public.email_attachments for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "email_inbox_attachments_storage_select" on storage.objects;
drop policy if exists "email_inbox_attachments_storage_insert" on storage.objects;

create policy "email_inbox_attachments_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'email-inbox-attachments'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

create policy "email_inbox_attachments_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'email-inbox-attachments'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );
