-- Nurses may read a visit if they are on the patient assignment OR are the visit's assigned clinician (dispatch).

drop policy if exists "patient_visits_select_assigned_nurse" on public.patient_visits;

create policy "patient_visits_select_assigned_nurse"
  on public.patient_visits for select to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role = 'nurse'
        and sp.is_active = true
        and (
          patient_visits.assigned_user_id = sp.user_id
          or exists (
            select 1
            from public.patient_assignments pa
            where pa.patient_id = patient_visits.patient_id
              and pa.assigned_user_id = sp.user_id
              and pa.is_active = true
          )
        )
    )
  );
