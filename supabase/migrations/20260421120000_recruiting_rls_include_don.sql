-- Align recruiting CRM RLS with isManagerOrHigher (includes don).
-- Original policies omitted "don", so JWT / authenticated clients could not INSERT/UPDATE
-- when bypassing service role or when RLS applies to the session.

drop policy if exists "recruiting_candidates_select_staff" on public.recruiting_candidates;
create policy "recruiting_candidates_select_staff"
  on public.recruiting_candidates for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "recruiting_candidates_insert_staff" on public.recruiting_candidates;
create policy "recruiting_candidates_insert_staff"
  on public.recruiting_candidates for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "recruiting_candidates_update_staff" on public.recruiting_candidates;
create policy "recruiting_candidates_update_staff"
  on public.recruiting_candidates for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "recruiting_candidates_delete_staff" on public.recruiting_candidates;
create policy "recruiting_candidates_delete_staff"
  on public.recruiting_candidates for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "recruiting_candidate_activities_select_staff" on public.recruiting_candidate_activities;
create policy "recruiting_candidate_activities_select_staff"
  on public.recruiting_candidate_activities for select to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "recruiting_candidate_activities_insert_staff" on public.recruiting_candidate_activities;
create policy "recruiting_candidate_activities_insert_staff"
  on public.recruiting_candidate_activities for insert to authenticated
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "recruiting_candidate_activities_update_staff" on public.recruiting_candidate_activities;
create policy "recruiting_candidate_activities_update_staff"
  on public.recruiting_candidate_activities for update to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  )
  with check (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );

drop policy if exists "recruiting_candidate_activities_delete_staff" on public.recruiting_candidate_activities;
create policy "recruiting_candidate_activities_delete_staff"
  on public.recruiting_candidate_activities for delete to authenticated
  using (
    exists (
      select 1 from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('manager', 'admin', 'super_admin', 'don')
    )
  );
