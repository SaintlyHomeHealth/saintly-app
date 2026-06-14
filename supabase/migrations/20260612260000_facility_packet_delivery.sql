-- Phase 20: Packet delivery automation (email/fax attempts + materials storage).

insert into storage.buckets (id, name, public)
values ('facility-packet-materials', 'facility-packet-materials', false)
on conflict (id) do nothing;

alter table public.facility_packet_materials
  add column if not exists file_name text null,
  add column if not exists mime_type text null,
  add column if not exists file_size_bytes bigint null;

alter table public.facility_packet_requests
  add column if not exists last_delivery_attempt_id uuid null,
  add column if not exists delivery_attempt_count integer not null default 0,
  add column if not exists delivery_error text null,
  add column if not exists last_delivery_status text null,
  add column if not exists material_ids uuid[] null;

create table if not exists public.facility_packet_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  packet_request_id uuid not null references public.facility_packet_requests (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  contact_id uuid null references public.facility_contacts (id) on delete set null,
  delivery_method text not null,
  status text not null default 'pending',
  recipient_name text null,
  recipient_email text null,
  recipient_fax text null,
  subject text null,
  message text null,
  cover_sheet text null,
  material_ids uuid[] null,
  attachment_paths text[] null,
  provider text null,
  provider_message_id text null,
  provider_status text null,
  error_message text null,
  sent_at timestamptz null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_packet_delivery_attempts_method_check
    check (delivery_method in ('email', 'fax', 'manual')),
  constraint facility_packet_delivery_attempts_status_check
    check (status in ('pending', 'sent', 'failed', 'accepted', 'delivered', 'canceled'))
);

create index if not exists facility_packet_delivery_attempts_packet_request_id_idx
  on public.facility_packet_delivery_attempts (packet_request_id);
create index if not exists facility_packet_delivery_attempts_facility_id_idx
  on public.facility_packet_delivery_attempts (facility_id);
create index if not exists facility_packet_delivery_attempts_contact_id_idx
  on public.facility_packet_delivery_attempts (contact_id);
create index if not exists facility_packet_delivery_attempts_status_idx
  on public.facility_packet_delivery_attempts (status);
create index if not exists facility_packet_delivery_attempts_delivery_method_idx
  on public.facility_packet_delivery_attempts (delivery_method);
create index if not exists facility_packet_delivery_attempts_created_at_idx
  on public.facility_packet_delivery_attempts (created_at desc);

alter table public.facility_packet_requests
  drop constraint if exists facility_packet_requests_last_delivery_attempt_fkey;

alter table public.facility_packet_requests
  add constraint facility_packet_requests_last_delivery_attempt_fkey
  foreign key (last_delivery_attempt_id)
  references public.facility_packet_delivery_attempts (id)
  on delete set null;

create or replace function public.touch_facility_packet_delivery_attempts_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists facility_packet_delivery_attempts_updated_at on public.facility_packet_delivery_attempts;
create trigger facility_packet_delivery_attempts_updated_at
  before update on public.facility_packet_delivery_attempts
  for each row execute function public.touch_facility_packet_delivery_attempts_updated_at();

alter table public.facility_packet_delivery_attempts enable row level security;

drop policy if exists "facility_packet_delivery_attempts_select_staff" on public.facility_packet_delivery_attempts;
create policy "facility_packet_delivery_attempts_select_staff"
  on public.facility_packet_delivery_attempts for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'sales_agent')
    )
  );

drop policy if exists "facility_packet_materials_storage_select_staff" on storage.objects;
drop policy if exists "facility_packet_materials_storage_insert_staff" on storage.objects;
drop policy if exists "facility_packet_materials_storage_update_staff" on storage.objects;
drop policy if exists "facility_packet_materials_storage_delete_staff" on storage.objects;

create policy "facility_packet_materials_storage_select_staff"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'facility-packet-materials'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'sales_agent')
    )
  );

create policy "facility_packet_materials_storage_insert_staff"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'facility-packet-materials'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "facility_packet_materials_storage_update_staff"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'facility-packet-materials'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

create policy "facility_packet_materials_storage_delete_staff"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'facility-packet-materials'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin')
    )
  );

comment on table public.facility_packet_delivery_attempts is
  'Email/fax/manual delivery attempts for facility packet requests.';
