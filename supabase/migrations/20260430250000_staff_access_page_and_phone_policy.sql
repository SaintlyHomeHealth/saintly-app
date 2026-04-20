-- Staff Access: granular page policy fields, phone policy metadata, expanded roles, nurse admin shell gate.
-- Safe for existing rows: defaults preserve prior behavior (org-default phone, inbound/outbound, nurses stay workspace-first).

alter table public.staff_profiles drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (
    role in (
      'super_admin',
      'admin',
      'manager',
      'nurse',
      'don',
      'recruiter',
      'billing',
      'dispatch',
      'credentialing',
      'read_only'
    )
  );

-- When false, clinical/workspace roles skip /admin (middleware) and land on workspace keypad.
alter table public.staff_profiles
  add column if not exists admin_shell_access boolean not null default true;

comment on column public.staff_profiles.admin_shell_access is
  'If false for workspace-first roles (e.g. nurse), middleware blocks /admin until enabled in Staff Access.';

update public.staff_profiles
set admin_shell_access = false
where role = 'nurse';

-- Optional UI preset slug; null = derive defaults from role in app code.
alter table public.staff_profiles
  add column if not exists page_access_preset text;

comment on column public.staff_profiles.page_access_preset is
  'Staff Access preset key (nurse, admin, manager, recruiter, billing, dispatch, credentialing, read_only, custom).';

-- Per-page overrides: { "command_center": true, "workspace_pay": false, ... }. Empty object = preset/role only.
alter table public.staff_profiles
  add column if not exists page_permissions jsonb not null default '{}'::jsonb;

alter table public.staff_profiles
  add column if not exists require_password_change boolean not null default false;

comment on column public.staff_profiles.require_password_change is
  'When true, user must set a new password after admin reset / temp login (enforced in middleware + login flow).';

alter table public.staff_profiles
  add column if not exists phone_assignment_mode text not null default 'organization_default';

alter table public.staff_profiles drop constraint if exists staff_profiles_phone_assignment_mode_check;

alter table public.staff_profiles
  add constraint staff_profiles_phone_assignment_mode_check
  check (phone_assignment_mode in ('organization_default', 'dedicated', 'shared'));

comment on column public.staff_profiles.phone_assignment_mode is
  'organization_default: env-configured lines; dedicated: staff-owned DID from pool; shared: pool line shared with granular flags.';

alter table public.staff_profiles
  add column if not exists dedicated_outbound_e164 text,
  add column if not exists shared_line_e164 text;

alter table public.staff_profiles
  add column if not exists phone_calling_profile text not null default 'inbound_outbound';

alter table public.staff_profiles drop constraint if exists staff_profiles_phone_calling_profile_check;

alter table public.staff_profiles
  add constraint staff_profiles_phone_calling_profile_check
  check (phone_calling_profile in ('outbound_only', 'inbound_outbound', 'inbound_disabled'));

alter table public.staff_profiles
  add column if not exists sms_messaging_enabled boolean not null default true,
  add column if not exists voicemail_access_enabled boolean not null default true;

alter table public.staff_profiles
  add column if not exists shared_line_permissions jsonb not null default '{}'::jsonb;

comment on column public.staff_profiles.shared_line_permissions is
  'When phone_assignment_mode=shared: { full_access, outbound_only, receive_voice, sms, voicemail, call_history }.';

alter table public.staff_profiles
  add column if not exists softphone_mobile_enabled boolean not null default true,
  add column if not exists softphone_web_enabled boolean not null default true,
  add column if not exists push_notifications_enabled boolean not null default true,
  add column if not exists call_recording_enabled boolean not null default false;
