-- Email Marketing: templates, sender profiles, flyers, sent message history.

create table if not exists public.email_marketing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subject text not null,
  body text not null default '',
  category text not null default 'general'
    check (category in (
      'referral',
      'doctor_office',
      'primary_care',
      'assisted_living',
      'vendor_fair',
      'follow_up',
      'general'
    )),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_marketing_templates_active_idx
  on public.email_marketing_templates (is_active, category, name);

create table if not exists public.email_sender_profiles (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  display_name text not null,
  title text not null default '',
  phone text not null default '',
  fax text not null default '',
  email text not null default '',
  signature text not null default '',
  is_default boolean not null default false,
  is_custom boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists email_sender_profiles_one_default_idx
  on public.email_sender_profiles (is_default)
  where is_default = true;

create table if not exists public.email_marketing_flyers (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_url text not null,
  storage_path text not null,
  file_type text not null default 'application/pdf',
  title text not null,
  description text not null default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_marketing_flyers_active_idx
  on public.email_marketing_flyers (is_active, created_at desc);

create table if not exists public.email_marketing_messages (
  id uuid primary key default gen_random_uuid(),
  sent_by_user_id uuid references auth.users (id) on delete set null,
  sender_profile_id uuid references public.email_sender_profiles (id) on delete set null,
  custom_sender_name text,
  custom_sender_title text,
  custom_sender_phone text,
  custom_sender_email text,
  from_email text not null,
  reply_to_email text not null,
  recipient_email text not null,
  recipient_name text,
  organization_name text,
  subject text not null,
  body text not null default '',
  template_id uuid references public.email_marketing_templates (id) on delete set null,
  flyer_id uuid references public.email_marketing_flyers (id) on delete set null,
  attach_flyer boolean not null default false,
  status text not null default 'draft'
    check (status in ('draft', 'queued', 'sending', 'sent', 'failed')),
  provider text,
  provider_message_id text,
  error_message text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_marketing_messages_sent_by_idx
  on public.email_marketing_messages (sent_by_user_id, created_at desc);
create index if not exists email_marketing_messages_status_idx
  on public.email_marketing_messages (status, created_at desc);
create index if not exists email_marketing_messages_sent_at_idx
  on public.email_marketing_messages (sent_at desc nulls last);

create or replace function public.touch_email_marketing_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists email_marketing_templates_updated_at on public.email_marketing_templates;
create trigger email_marketing_templates_updated_at
  before update on public.email_marketing_templates
  for each row execute function public.touch_email_marketing_updated_at();

drop trigger if exists email_sender_profiles_updated_at on public.email_sender_profiles;
create trigger email_sender_profiles_updated_at
  before update on public.email_sender_profiles
  for each row execute function public.touch_email_marketing_updated_at();

drop trigger if exists email_marketing_flyers_updated_at on public.email_marketing_flyers;
create trigger email_marketing_flyers_updated_at
  before update on public.email_marketing_flyers
  for each row execute function public.touch_email_marketing_updated_at();

drop trigger if exists email_marketing_messages_updated_at on public.email_marketing_messages;
create trigger email_marketing_messages_updated_at
  before update on public.email_marketing_messages
  for each row execute function public.touch_email_marketing_updated_at();

insert into storage.buckets (id, name, public)
values ('email-marketing-flyers', 'email-marketing-flyers', true)
on conflict (id) do nothing;

-- Starter templates
insert into public.email_marketing_templates (name, subject, body, category)
values
  (
    'Referral Introduction',
    'Partnering with your team — Saintly Home Health',
    E'Hello {{recipient_name}},\n\nThank you for the opportunity to connect. Saintly Home Health LLC provides Medicare-certified home health, skilled nursing, therapy, and wound care throughout the Valley.\n\nWe would welcome the chance to support your patients with responsive coordination, clear communication, and reliable follow-through.\n\nPlease let us know the best way to stay in touch and how we can make referrals easy for your team.\n\nThank you,',
    'referral'
  ),
  (
    'Doctor Office Outreach',
    'Saintly Home Health — physician office partnership',
    E'Hello {{recipient_name}},\n\nI am reaching out from Saintly Home Health LLC to introduce our physician-aligned home health services.\n\nWe focus on timely starts of care, strong clinical communication, and dependable discharge follow-up for your patients who need care at home.\n\nIf helpful, we can share our referral process, service area, and clinical capabilities.\n\nThank you for your consideration,',
    'doctor_office'
  ),
  (
    'Primary Care Clinic Outreach',
    'Primary care partnership — Saintly Home Health',
    E'Hello {{recipient_name}},\n\nSaintly Home Health LLC partners with primary care clinics to help patients transition safely to skilled care at home.\n\nWe would appreciate the opportunity to support your clinic with responsive coordination and a dedicated referral contact.\n\nPlease let us know if we may stop by, send materials, or schedule a brief introduction.\n\nThank you,',
    'primary_care'
  ),
  (
    'Assisted Living Facility Outreach',
    'Saintly Home Health — assisted living partnership',
    E'Hello {{recipient_name}},\n\nSaintly Home Health LLC provides skilled home health services for residents who need nursing, therapy, or wound care while in or transitioning from your community.\n\nWe would welcome the chance to discuss how we can support your staff and residents with reliable clinical coordination.\n\nPlease let us know a good time to connect.\n\nThank you,',
    'assisted_living'
  ),
  (
    'Vendor Fair Application',
    'Saintly Home Health — vendor fair participation',
    E'Hello {{recipient_name}},\n\nSaintly Home Health LLC would like to participate in your upcoming vendor fair or community outreach event.\n\nWe provide Medicare-certified home health services and would appreciate the opportunity to share information with your organization and attendees.\n\nPlease let us know application requirements, deadlines, and booth details.\n\nThank you,',
    'vendor_fair'
  ),
  (
    'Follow-Up Email',
    'Following up — Saintly Home Health',
    E'Hello {{recipient_name}},\n\nI wanted to follow up on my earlier note regarding Saintly Home Health LLC.\n\nIf now is a good time, we would welcome the chance to connect, answer questions, or share referral materials.\n\nThank you again for your time,',
    'follow_up'
  );

-- Sender profiles (shared CRM signatures; outbound From uses admin@ via env)
insert into public.email_sender_profiles (slug, display_name, title, phone, fax, email, signature, is_default, is_custom)
values
  (
    'paul_vonasek',
    'Paul Vonasek',
    'Vice President',
    '480-360-0008',
    '480-393-4119',
    'admin@saintlyhomehealth.com',
    'Care That Goes Above.',
    false,
    false
  ),
  (
    'sandy_cooper',
    'Sandy Cooper',
    'Administrator',
    '480-360-0008',
    '480-393-4119',
    'admin@saintlyhomehealth.com',
    '',
    false,
    false
  ),
  (
    'saintly_admin',
    'Saintly Home Health Admin',
    'Administrative Team',
    '480-360-0008',
    '480-393-4119',
    'admin@saintlyhomehealth.com',
    '',
    true,
    false
  ),
  (
    'custom',
    'Custom sender',
    '',
    '',
    '',
    'admin@saintlyhomehealth.com',
    '',
    false,
    true
  )
on conflict (slug) do nothing;

alter table public.email_marketing_templates enable row level security;
alter table public.email_sender_profiles enable row level security;
alter table public.email_marketing_flyers enable row level security;
alter table public.email_marketing_messages enable row level security;

-- Staff with manager+ roles can read templates and sender profiles
drop policy if exists "email_marketing_templates_select_staff" on public.email_marketing_templates;
create policy "email_marketing_templates_select_staff"
  on public.email_marketing_templates for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "email_marketing_templates_write_admin" on public.email_marketing_templates;
create policy "email_marketing_templates_write_admin"
  on public.email_marketing_templates for all to authenticated
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

drop policy if exists "email_sender_profiles_select_staff" on public.email_sender_profiles;
create policy "email_sender_profiles_select_staff"
  on public.email_sender_profiles for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "email_sender_profiles_write_admin" on public.email_sender_profiles;
create policy "email_sender_profiles_write_admin"
  on public.email_sender_profiles for all to authenticated
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

drop policy if exists "email_marketing_flyers_select_staff" on public.email_marketing_flyers;
create policy "email_marketing_flyers_select_staff"
  on public.email_marketing_flyers for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

drop policy if exists "email_marketing_flyers_write_staff" on public.email_marketing_flyers;
create policy "email_marketing_flyers_write_staff"
  on public.email_marketing_flyers for all to authenticated
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

-- Owners/admins see all history; other staff see their own sends and drafts
drop policy if exists "email_marketing_messages_select_staff" on public.email_marketing_messages;
create policy "email_marketing_messages_select_staff"
  on public.email_marketing_messages for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
        and (
          sp.role in ('admin', 'super_admin')
          or email_marketing_messages.sent_by_user_id = auth.uid()
        )
    )
  );

drop policy if exists "email_marketing_messages_insert_staff" on public.email_marketing_messages;
create policy "email_marketing_messages_insert_staff"
  on public.email_marketing_messages for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
    and sent_by_user_id = auth.uid()
  );

drop policy if exists "email_marketing_messages_update_staff" on public.email_marketing_messages;
create policy "email_marketing_messages_update_staff"
  on public.email_marketing_messages for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and (
          sp.role in ('admin', 'super_admin')
          or (
            sp.role in ('manager', 'don', 'recruiter', 'dispatch', 'billing', 'credentialing')
            and email_marketing_messages.sent_by_user_id = auth.uid()
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and (
          sp.role in ('admin', 'super_admin')
          or (
            sp.role in ('manager', 'don', 'recruiter', 'dispatch', 'billing', 'credentialing')
            and sent_by_user_id = auth.uid()
          )
        )
    )
  );

drop policy if exists "email_marketing_flyers_storage_select" on storage.objects;
drop policy if exists "email_marketing_flyers_storage_insert" on storage.objects;
drop policy if exists "email_marketing_flyers_storage_update" on storage.objects;
drop policy if exists "email_marketing_flyers_storage_delete" on storage.objects;

create policy "email_marketing_flyers_storage_select"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'email-marketing-flyers'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin', 'recruiter', 'dispatch', 'billing', 'credentialing')
    )
  );

create policy "email_marketing_flyers_storage_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'email-marketing-flyers'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

create policy "email_marketing_flyers_storage_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'email-marketing-flyers'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('manager', 'don', 'admin', 'super_admin')
    )
  );

create policy "email_marketing_flyers_storage_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'email-marketing-flyers'
    and exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.is_active = true
        and sp.role in ('admin', 'super_admin')
    )
  );
