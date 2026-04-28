-- Admin Fax Center: Telnyx fax inbox, storage, matching metadata, and audit events.

create table if not exists public.fax_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  telnyx_fax_id text unique,
  direction text not null check (direction in ('inbound', 'outbound')),
  status text not null default 'received',
  from_number text,
  to_number text,
  fax_number_label text,
  sender_name text,
  recipient_name text,
  subject text,
  page_count integer,
  media_url text,
  storage_path text,
  pdf_url text,
  thumbnail_url text,
  assigned_to_user_id uuid references auth.users (id) on delete set null,
  lead_id uuid references public.leads (id) on delete set null,
  patient_id uuid references public.patients (id) on delete set null,
  facility_id uuid references public.facilities (id) on delete set null,
  referral_source_id uuid,
  contact_id uuid references public.contacts (id) on delete set null,
  tags text[] not null default '{}',
  category text not null default 'misc'
    check (category in ('referral', 'orders', 'signed_docs', 'insurance', 'marketing', 'misc')),
  priority text not null default 'normal' check (priority in ('normal', 'urgent')),
  is_read boolean not null default false,
  is_archived boolean not null default false,
  received_at timestamptz,
  sent_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  failure_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fax_messages_direction_status_idx on public.fax_messages (direction, status, created_at desc);
create index if not exists fax_messages_inbox_idx on public.fax_messages (is_archived, is_read, received_at desc);
create index if not exists fax_messages_from_number_idx on public.fax_messages (from_number) where from_number is not null;
create index if not exists fax_messages_to_number_idx on public.fax_messages (to_number) where to_number is not null;
create index if not exists fax_messages_lead_id_idx on public.fax_messages (lead_id) where lead_id is not null;
create index if not exists fax_messages_patient_id_idx on public.fax_messages (patient_id) where patient_id is not null;
create index if not exists fax_messages_facility_id_idx on public.fax_messages (facility_id) where facility_id is not null;
create index if not exists fax_messages_tags_idx on public.fax_messages using gin (tags);

create table if not exists public.fax_events (
  id uuid primary key default gen_random_uuid(),
  fax_message_id uuid not null references public.fax_messages (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists fax_events_message_created_idx on public.fax_events (fax_message_id, created_at desc);

create table if not exists public.fax_contact_numbers (
  id uuid primary key default gen_random_uuid(),
  number_e164 text not null,
  display_name text,
  organization_name text,
  lead_id uuid references public.leads (id) on delete set null,
  patient_id uuid references public.patients (id) on delete set null,
  facility_id uuid references public.facilities (id) on delete set null,
  referral_source_id uuid,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint fax_contact_numbers_number_e164_key unique (number_e164)
);

create index if not exists fax_contact_numbers_lead_id_idx on public.fax_contact_numbers (lead_id) where lead_id is not null;
create index if not exists fax_contact_numbers_patient_id_idx on public.fax_contact_numbers (patient_id) where patient_id is not null;
create index if not exists fax_contact_numbers_facility_id_idx on public.fax_contact_numbers (facility_id) where facility_id is not null;

create or replace function public.touch_fax_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists fax_messages_updated_at on public.fax_messages;
create trigger fax_messages_updated_at
  before update on public.fax_messages
  for each row
  execute function public.touch_fax_updated_at();

drop trigger if exists fax_contact_numbers_updated_at on public.fax_contact_numbers;
create trigger fax_contact_numbers_updated_at
  before update on public.fax_contact_numbers
  for each row
  execute function public.touch_fax_updated_at();

insert into storage.buckets (id, name, public)
values ('fax-documents', 'fax-documents', false)
on conflict (id) do nothing;

alter table public.fax_messages enable row level security;
alter table public.fax_events enable row level security;
alter table public.fax_contact_numbers enable row level security;

drop policy if exists "fax_messages_select_staff" on public.fax_messages;
create policy "fax_messages_select_staff"
  on public.fax_messages for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "fax_messages_write_staff" on public.fax_messages;
create policy "fax_messages_write_staff"
  on public.fax_messages for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "fax_events_select_staff" on public.fax_events;
create policy "fax_events_select_staff"
  on public.fax_events for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "fax_events_write_staff" on public.fax_events;
create policy "fax_events_write_staff"
  on public.fax_events for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "fax_contact_numbers_select_staff" on public.fax_contact_numbers;
create policy "fax_contact_numbers_select_staff"
  on public.fax_contact_numbers for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "fax_contact_numbers_write_staff" on public.fax_contact_numbers;
create policy "fax_contact_numbers_write_staff"
  on public.fax_contact_numbers for all to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "fax_documents_select_staff" on storage.objects;
create policy "fax_documents_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'fax-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

drop policy if exists "fax_documents_write_staff" on storage.objects;
create policy "fax_documents_write_staff"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'fax-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  )
  with check (
    bucket_id = 'fax-documents'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );
