-- Add clinical phone role for staff (Phase 1 phone workspace).

alter table public.staff_profiles drop constraint if exists staff_profiles_role_check;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role in ('super_admin', 'admin', 'manager', 'nurse'));
