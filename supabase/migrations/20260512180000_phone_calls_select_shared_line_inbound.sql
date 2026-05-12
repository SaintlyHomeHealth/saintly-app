-- Allow phone workspace staff without org-wide visibility to SELECT shared-line inbound rows
-- where owner_user_id is often null (so nurses can see missed inbound in /workspace/phone/calls).
-- Outbound/other-party rows remain limited to owner, assignee match, or unassigned queue.

drop policy if exists "phone_calls_select_staff" on public.phone_calls;

create policy "phone_calls_select_staff"
  on public.phone_calls
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid ())
        and sp.is_active is distinct from false
        and sp.role <> 'read_only'
        and sp.role in (
          'super_admin',
          'admin',
          'manager',
          'nurse',
          'don',
          'recruiter',
          'billing',
          'dispatch',
          'credentialing'
        )
    )
    and (
      public.staff_has_full_phone_visibility ()
      or (
        owner_user_id is not null
        and owner_user_id = (select auth.uid ())
      )
      or assigned_to_user_id = (select auth.uid ())
      or assigned_to_user_id is null
      or direction = 'inbound'
    )
  );
