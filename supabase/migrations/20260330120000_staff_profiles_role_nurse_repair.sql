-- Ensure staff_profiles.role CHECK includes 'nurse'.
-- Fixes environments where 20260329150000 was not applied or used a different constraint name.

alter table public.staff_profiles drop constraint if exists staff_profiles_role_check;

do $$
declare
  con_name text;
begin
  for con_name in
    select c.conname
    from pg_constraint c
    join pg_class t on c.conrelid = t.oid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'staff_profiles'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%role%in (%'
  loop
    execute format('alter table public.staff_profiles drop constraint %I', con_name);
  end loop;
end $$;

alter table public.staff_profiles
  add constraint staff_profiles_role_check
  check (role in ('super_admin', 'admin', 'manager', 'nurse'));
