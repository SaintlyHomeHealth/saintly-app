-- Allow staff_profiles.phone_assignment_mode = dedicated_and_shared (CRM DID + shared company line).

alter table public.staff_profiles
  drop constraint if exists staff_profiles_phone_assignment_mode_check;

alter table public.staff_profiles
  add constraint staff_profiles_phone_assignment_mode_check check (
    phone_assignment_mode in (
      'organization_default',
      'dedicated',
      'shared',
      'dedicated_and_shared'
    )
  );

comment on column public.staff_profiles.phone_assignment_mode is
  'organization_default | dedicated | shared | dedicated_and_shared — controls outbound identity + shared-line entitlements (see shared_line_permissions).';
