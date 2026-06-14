-- Phase 19: Facility packet / materials fulfillment tracking.

create table if not exists public.facility_packet_requests (
  id uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  contact_id uuid null references public.facility_contacts (id) on delete set null,
  activity_id uuid null references public.facility_activities (id) on delete set null,
  lead_id uuid null references public.leads (id) on delete set null,
  campaign_id uuid null references public.facility_campaigns (id) on delete set null,
  campaign_step_instance_id uuid null references public.facility_campaign_step_instances (id) on delete set null,
  requested_by_user_id uuid null references auth.users (id) on delete set null,
  assigned_to uuid null references auth.users (id) on delete set null,
  delivery_method text null,
  status text not null default 'pending',
  priority text not null default 'Normal',
  requested_at timestamptz not null default now(),
  due_at timestamptz null,
  sent_at timestamptz null,
  sent_by uuid null references auth.users (id) on delete set null,
  confirmed_received_at timestamptz null,
  confirmed_by uuid null references auth.users (id) on delete set null,
  recipient_name text null,
  recipient_role text null,
  recipient_email text null,
  recipient_fax text null,
  recipient_phone text null,
  packet_type text null,
  notes text null,
  sent_notes text null,
  follow_up_task_id uuid null references public.facility_follow_up_tasks (id) on delete set null,
  metadata jsonb null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_packet_requests_status_check
    check (status in ('pending', 'sent', 'confirmed_received', 'canceled', 'failed')),
  constraint facility_packet_requests_priority_check
    check (priority in ('Low', 'Normal', 'High')),
  constraint facility_packet_requests_delivery_method_check
    check (
      delivery_method is null
      or delivery_method in ('fax', 'email', 'print_dropoff', 'hand_delivered', 'portal_upload', 'other')
    ),
  constraint facility_packet_requests_packet_type_check
    check (
      packet_type is null
      or packet_type in (
        'general_agency_packet',
        'referral_packet',
        'wound_care_packet',
        'pediatric_packet',
        'private_pay_packet',
        'credentialing_packet',
        'other'
      )
    )
);

create index if not exists facility_packet_requests_facility_id_idx
  on public.facility_packet_requests (facility_id);
create index if not exists facility_packet_requests_contact_id_idx
  on public.facility_packet_requests (contact_id);
create index if not exists facility_packet_requests_activity_id_idx
  on public.facility_packet_requests (activity_id);
create index if not exists facility_packet_requests_status_idx
  on public.facility_packet_requests (status);
create index if not exists facility_packet_requests_assigned_to_idx
  on public.facility_packet_requests (assigned_to);
create index if not exists facility_packet_requests_due_at_idx
  on public.facility_packet_requests (due_at);
create index if not exists facility_packet_requests_requested_at_idx
  on public.facility_packet_requests (requested_at desc);
create index if not exists facility_packet_requests_sent_at_idx
  on public.facility_packet_requests (sent_at);

comment on table public.facility_packet_requests is
  'Tracks facility requests for Saintly packets and materials fulfillment.';

create table if not exists public.facility_packet_materials (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  packet_type text null,
  storage_path text null,
  external_url text null,
  is_active boolean not null default true,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists facility_packet_materials_packet_type_idx
  on public.facility_packet_materials (packet_type)
  where packet_type is not null;

comment on table public.facility_packet_materials is
  'Library of Saintly packet PDFs and brochure links for field sales.';

alter table public.facility_follow_up_tasks
  add column if not exists packet_request_id uuid null
    references public.facility_packet_requests (id) on delete set null;

create index if not exists facility_follow_up_tasks_packet_request_id_idx
  on public.facility_follow_up_tasks (packet_request_id)
  where packet_request_id is not null;

alter table public.facility_follow_up_tasks
  drop constraint if exists facility_follow_up_tasks_source_check;

alter table public.facility_follow_up_tasks
  add constraint facility_follow_up_tasks_source_check
  check (
    source is null
    or source in (
      'quick_log',
      'ai_capture',
      'manual',
      'photo_note',
      'advanced_log',
      'facility_referral',
      'campaign',
      'packet'
    )
  );

create or replace function public.touch_facility_packet_requests_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists facility_packet_requests_updated_at on public.facility_packet_requests;
create trigger facility_packet_requests_updated_at
  before update on public.facility_packet_requests
  for each row execute function public.touch_facility_packet_requests_updated_at();

create or replace function public.touch_facility_packet_materials_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists facility_packet_materials_updated_at on public.facility_packet_materials;
create trigger facility_packet_materials_updated_at
  before update on public.facility_packet_materials
  for each row execute function public.touch_facility_packet_materials_updated_at();

alter table public.facility_packet_requests enable row level security;
alter table public.facility_packet_materials enable row level security;

drop policy if exists "facility_packet_requests_select_staff" on public.facility_packet_requests;
create policy "facility_packet_requests_select_staff"
  on public.facility_packet_requests for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'sales_agent')
    )
  );

drop policy if exists "facility_packet_materials_select_staff" on public.facility_packet_materials;
create policy "facility_packet_materials_select_staff"
  on public.facility_packet_materials for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'sales_agent')
    )
  );
