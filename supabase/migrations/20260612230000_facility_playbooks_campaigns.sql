-- Facility outreach playbooks and campaigns (Phase 17).

-- Extend follow-up tasks for campaign linkage.
alter table public.facility_follow_up_tasks
  add column if not exists campaign_id uuid null,
  add column if not exists campaign_enrollment_id uuid null,
  add column if not exists campaign_step_instance_id uuid null;

alter table public.facility_follow_up_tasks
  drop constraint if exists facility_follow_up_tasks_source_check;

alter table public.facility_follow_up_tasks
  add constraint facility_follow_up_tasks_source_check
  check (
    source is null
    or source in (
      'quick_log', 'ai_capture', 'manual', 'photo_note', 'advanced_log', 'facility_referral', 'campaign'
    )
  );

create index if not exists facility_follow_up_tasks_campaign_id_idx
  on public.facility_follow_up_tasks (campaign_id);

create index if not exists facility_follow_up_tasks_campaign_step_instance_id_idx
  on public.facility_follow_up_tasks (campaign_step_instance_id);

-- Playbooks
create table if not exists public.facility_outreach_playbooks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  facility_type text null,
  specialty_tags text[] null default '{}'::text[],
  status text not null default 'active',
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_outreach_playbooks_status_check
    check (status in ('active', 'inactive', 'archived'))
);

create index if not exists facility_outreach_playbooks_status_idx
  on public.facility_outreach_playbooks (status);

create table if not exists public.facility_outreach_playbook_steps (
  id uuid primary key default gen_random_uuid(),
  playbook_id uuid not null references public.facility_outreach_playbooks (id) on delete cascade,
  step_number integer not null,
  title text not null,
  description text null,
  due_offset_days integer not null default 0,
  suggested_activity_type text null,
  suggested_outcome text null,
  suggested_follow_up_task text null,
  requires_photo boolean not null default false,
  requires_contact_capture boolean not null default false,
  requires_referral_process_capture boolean not null default false,
  created_at timestamptz not null default now(),
  unique (playbook_id, step_number)
);

create index if not exists facility_outreach_playbook_steps_playbook_id_idx
  on public.facility_outreach_playbook_steps (playbook_id, step_number);

-- Campaigns
create table if not exists public.facility_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text null,
  playbook_id uuid null references public.facility_outreach_playbooks (id) on delete set null,
  assigned_rep_id uuid null references auth.users (id) on delete set null,
  status text not null default 'active',
  start_date date not null default current_date,
  end_date date null,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_campaigns_status_check
    check (status in ('draft', 'active', 'paused', 'completed', 'archived'))
);

create index if not exists facility_campaigns_status_idx on public.facility_campaigns (status);
create index if not exists facility_campaigns_playbook_id_idx on public.facility_campaigns (playbook_id);
create index if not exists facility_campaigns_assigned_rep_id_idx on public.facility_campaigns (assigned_rep_id);

create table if not exists public.facility_campaign_enrollments (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.facility_campaigns (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  assigned_rep_id uuid null references auth.users (id) on delete set null,
  status text not null default 'active',
  enrolled_at timestamptz not null default now(),
  completed_at timestamptz null,
  current_step_number integer not null default 1,
  last_activity_id uuid null references public.facility_activities (id) on delete set null,
  next_task_id uuid null references public.facility_follow_up_tasks (id) on delete set null,
  progress_json jsonb null default '{}'::jsonb,
  created_by uuid null references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_campaign_enrollments_status_check
    check (status in ('active', 'completed', 'paused', 'removed'))
);

create unique index if not exists facility_campaign_enrollments_active_uidx
  on public.facility_campaign_enrollments (campaign_id, facility_id)
  where status = 'active';

create index if not exists facility_campaign_enrollments_campaign_id_idx
  on public.facility_campaign_enrollments (campaign_id);

create index if not exists facility_campaign_enrollments_facility_id_idx
  on public.facility_campaign_enrollments (facility_id);

create index if not exists facility_campaign_enrollments_assigned_rep_id_idx
  on public.facility_campaign_enrollments (assigned_rep_id);

create index if not exists facility_campaign_enrollments_status_idx
  on public.facility_campaign_enrollments (status);

create table if not exists public.facility_campaign_step_instances (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.facility_campaign_enrollments (id) on delete cascade,
  campaign_id uuid not null references public.facility_campaigns (id) on delete cascade,
  facility_id uuid not null references public.facilities (id) on delete cascade,
  playbook_step_id uuid not null references public.facility_outreach_playbook_steps (id) on delete restrict,
  step_number integer not null,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'open',
  linked_task_id uuid null references public.facility_follow_up_tasks (id) on delete set null,
  linked_activity_id uuid null references public.facility_activities (id) on delete set null,
  completed_at timestamptz null,
  completed_by uuid null references auth.users (id) on delete set null,
  notes text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint facility_campaign_step_instances_status_check
    check (status in ('open', 'completed', 'skipped', 'canceled'))
);

create index if not exists facility_campaign_step_instances_campaign_id_idx
  on public.facility_campaign_step_instances (campaign_id);

create index if not exists facility_campaign_step_instances_facility_id_idx
  on public.facility_campaign_step_instances (facility_id);

create index if not exists facility_campaign_step_instances_enrollment_id_idx
  on public.facility_campaign_step_instances (enrollment_id);

create index if not exists facility_campaign_step_instances_status_due_idx
  on public.facility_campaign_step_instances (status, due_at);

-- FK back-references on follow-up tasks (after step_instances exist)
alter table public.facility_follow_up_tasks
  drop constraint if exists facility_follow_up_tasks_campaign_id_fkey;
alter table public.facility_follow_up_tasks
  add constraint facility_follow_up_tasks_campaign_id_fkey
  foreign key (campaign_id) references public.facility_campaigns (id) on delete set null;

alter table public.facility_follow_up_tasks
  drop constraint if exists facility_follow_up_tasks_campaign_enrollment_id_fkey;
alter table public.facility_follow_up_tasks
  add constraint facility_follow_up_tasks_campaign_enrollment_id_fkey
  foreign key (campaign_enrollment_id) references public.facility_campaign_enrollments (id) on delete set null;

alter table public.facility_follow_up_tasks
  drop constraint if exists facility_follow_up_tasks_campaign_step_instance_id_fkey;
alter table public.facility_follow_up_tasks
  add constraint facility_follow_up_tasks_campaign_step_instance_id_fkey
  foreign key (campaign_step_instance_id) references public.facility_campaign_step_instances (id) on delete set null;

-- Updated_at triggers
create or replace function public.touch_facility_playbook_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists facility_outreach_playbooks_updated_at on public.facility_outreach_playbooks;
create trigger facility_outreach_playbooks_updated_at
  before update on public.facility_outreach_playbooks
  for each row execute function public.touch_facility_playbook_updated_at();

drop trigger if exists facility_campaigns_updated_at on public.facility_campaigns;
create trigger facility_campaigns_updated_at
  before update on public.facility_campaigns
  for each row execute function public.touch_facility_playbook_updated_at();

drop trigger if exists facility_campaign_enrollments_updated_at on public.facility_campaign_enrollments;
create trigger facility_campaign_enrollments_updated_at
  before update on public.facility_campaign_enrollments
  for each row execute function public.touch_facility_playbook_updated_at();

drop trigger if exists facility_campaign_step_instances_updated_at on public.facility_campaign_step_instances;
create trigger facility_campaign_step_instances_updated_at
  before update on public.facility_campaign_step_instances
  for each row execute function public.touch_facility_playbook_updated_at();

-- RLS: read for authenticated staff; writes via service role
alter table public.facility_outreach_playbooks enable row level security;
alter table public.facility_outreach_playbook_steps enable row level security;
alter table public.facility_campaigns enable row level security;
alter table public.facility_campaign_enrollments enable row level security;
alter table public.facility_campaign_step_instances enable row level security;

drop policy if exists "facility_playbooks_select_staff" on public.facility_outreach_playbooks;
create policy "facility_playbooks_select_staff"
  on public.facility_outreach_playbooks for select to authenticated using (true);

drop policy if exists "facility_playbook_steps_select_staff" on public.facility_outreach_playbook_steps;
create policy "facility_playbook_steps_select_staff"
  on public.facility_outreach_playbook_steps for select to authenticated using (true);

drop policy if exists "facility_campaigns_select_staff" on public.facility_campaigns;
create policy "facility_campaigns_select_staff"
  on public.facility_campaigns for select to authenticated using (true);

drop policy if exists "facility_campaign_enrollments_select_staff" on public.facility_campaign_enrollments;
create policy "facility_campaign_enrollments_select_staff"
  on public.facility_campaign_enrollments for select to authenticated using (true);

drop policy if exists "facility_campaign_step_instances_select_staff" on public.facility_campaign_step_instances;
create policy "facility_campaign_step_instances_select_staff"
  on public.facility_campaign_step_instances for select to authenticated using (true);

-- Seed default playbooks (fixed IDs for idempotent seed)
insert into public.facility_outreach_playbooks (id, name, description, facility_type, specialty_tags, status)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'New Facility 30-Day Warm-Up',
    'Introduce Saintly to a new referral source over 30 days.',
    null,
    array['new_facility', 'warm_up'],
    'active'
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'Podiatry Outreach',
    'Wound care and PT referral source development for podiatry offices.',
    'Podiatry',
    array['podiatry', 'wound_care'],
    'active'
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'Warm Source Conversion',
    'Convert a warm conversation into an active referral relationship.',
    null,
    array['warm', 'conversion'],
    'active'
  ),
  (
    'a1000000-0000-4000-8000-000000000004',
    'Packet Requested',
    'Follow-up sequence after a facility requests Saintly materials.',
    null,
    array['packet'],
    'active'
  )
on conflict (id) do nothing;

-- New Facility 30-Day Warm-Up steps
insert into public.facility_outreach_playbook_steps
  (playbook_id, step_number, title, description, due_offset_days, suggested_activity_type, suggested_outcome, suggested_follow_up_task, requires_photo)
values
  ('a1000000-0000-4000-8000-000000000001', 1, 'Drop off intro materials', 'Leave Saintly packet and postcards.', 0, 'Cold Drop-In', 'Left Materials', 'Drop off intro materials', true),
  ('a1000000-0000-4000-8000-000000000001', 2, 'Call to confirm who handles referrals', 'Identify referral coordinator or office manager.', 2, 'Phone Call', 'Asked to Follow Up', 'Call to confirm referral contact', false),
  ('a1000000-0000-4000-8000-000000000001', 3, 'Send/fax referral packet', 'Fax or email full referral packet.', 3, 'Fax Drop', 'Wants Packet Faxed', 'Send/fax referral packet', false),
  ('a1000000-0000-4000-8000-000000000001', 4, 'Follow up with decision maker', 'Check in with the person who handles referrals.', 7, 'Follow-Up Visit', 'Good Conversation', 'Follow up with decision maker', false),
  ('a1000000-0000-4000-8000-000000000001', 5, 'Capture referral process', 'Document how they send referrals.', 14, 'In-Person Visit', 'Met Decision Maker', 'Capture referral process', false),
  ('a1000000-0000-4000-8000-000000000001', 6, 'Revisit for referral opportunity', 'Ask for a specific referral opportunity.', 30, 'In-Person Visit', 'Asked to Follow Up', 'Revisit for referral opportunity', false)
on conflict (playbook_id, step_number) do nothing;

-- Podiatry Outreach steps
insert into public.facility_outreach_playbook_steps
  (playbook_id, step_number, title, description, due_offset_days, suggested_activity_type, suggested_outcome, suggested_follow_up_task, requires_photo)
values
  ('a1000000-0000-4000-8000-000000000002', 1, 'Drop off wound/PT referral materials', 'Leave wound care and PT referral materials.', 0, 'Packet Dropped', 'Left Materials', 'Drop off wound/PT materials', true),
  ('a1000000-0000-4000-8000-000000000002', 2, 'Ask who handles home health referrals', 'Identify referral contact.', 2, 'Phone Call', 'Asked to Follow Up', 'Ask who handles HH referrals', false),
  ('a1000000-0000-4000-8000-000000000002', 3, 'Fax/email Saintly packet', 'Send full referral packet.', 3, 'Fax Drop', 'Wants Packet Faxed', 'Fax/email Saintly packet', false),
  ('a1000000-0000-4000-8000-000000000002', 4, 'Follow up on wound care/PT patients', 'Discuss appropriate patient types.', 7, 'Follow-Up Visit', 'Good Conversation', 'Follow up on wound/PT patients', false),
  ('a1000000-0000-4000-8000-000000000002', 5, 'Ask for best referral process', 'Capture how they prefer to send referrals.', 14, 'In-Person Visit', 'Met Decision Maker', 'Ask for referral process', false)
on conflict (playbook_id, step_number) do nothing;

-- Warm Source Conversion steps
insert into public.facility_outreach_playbook_steps
  (playbook_id, step_number, title, description, due_offset_days, suggested_activity_type, suggested_outcome, suggested_follow_up_task)
values
  ('a1000000-0000-4000-8000-000000000003', 1, 'Thank them / send packet', 'Follow up after warm conversation.', 0, 'Email', 'Wants Email Info', 'Thank and send packet'),
  ('a1000000-0000-4000-8000-000000000003', 2, 'Follow up with contact', 'Reconnect with the contact you met.', 2, 'Phone Call', 'Asked to Follow Up', 'Follow up with contact'),
  ('a1000000-0000-4000-8000-000000000003', 3, 'Ask for referral opportunity', 'Request a specific referral.', 7, 'Phone Call', 'Good Conversation', 'Ask for referral opportunity'),
  ('a1000000-0000-4000-8000-000000000003', 4, 'Revisit with materials', 'In-person follow-up with materials.', 14, 'In-Person Visit', 'Left Materials', 'Revisit with materials')
on conflict (playbook_id, step_number) do nothing;

-- Packet Requested steps
insert into public.facility_outreach_playbook_steps
  (playbook_id, step_number, title, description, due_offset_days, suggested_activity_type, suggested_outcome, suggested_follow_up_task, requires_referral_process_capture)
values
  ('a1000000-0000-4000-8000-000000000004', 1, 'Fax/email packet', 'Send requested materials immediately.', 0, 'Fax Drop', 'Wants Packet Faxed', 'Fax/email packet', false),
  ('a1000000-0000-4000-8000-000000000004', 2, 'Confirm packet received', 'Verify they received the packet.', 1, 'Phone Call', 'Asked to Follow Up', 'Confirm packet received', false),
  ('a1000000-0000-4000-8000-000000000004', 3, 'Follow up with decision maker', 'Speak with referral decision maker.', 3, 'Follow-Up Visit', 'Met Decision Maker', 'Follow up with decision maker', false),
  ('a1000000-0000-4000-8000-000000000004', 4, 'Ask for referral process', 'Document referral workflow.', 7, 'In-Person Visit', 'Good Conversation', 'Ask for referral process', true)
on conflict (playbook_id, step_number) do nothing;
