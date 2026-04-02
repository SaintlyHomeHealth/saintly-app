-- Dispatch: time windows, source, snapshots, optional schedule-time SMS tracking; nurse read access for assigned patients; staff SMS notify number.

-- Allow nurses to read visits only for patients they are actively assigned to (workspace Today uses authenticated client).
drop policy if exists "patient_visits_select_assigned_nurse" on public.patient_visits;
create policy "patient_visits_select_assigned_nurse"
  on public.patient_visits for select to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      join public.patient_assignments pa
        on pa.assigned_user_id = sp.user_id
       and pa.patient_id = patient_visits.patient_id
       and pa.is_active = true
      where sp.user_id = auth.uid()
        and sp.role = 'nurse'
        and sp.is_active = true
    )
  );

alter table public.patient_visits
  add column if not exists scheduled_end_at timestamptz,
  add column if not exists time_window_label text,
  add column if not exists created_from text,
  add column if not exists patient_phone_snapshot text,
  add column if not exists address_snapshot text,
  add column if not exists notify_patient_on_schedule boolean not null default false,
  add column if not exists notify_clinician_on_schedule boolean not null default false,
  add column if not exists dispatch_patient_notified_at timestamptz,
  add column if not exists dispatch_clinician_notified_at timestamptz;

comment on column public.patient_visits.scheduled_for is 'Visit start (exact appointment or window start).';
comment on column public.patient_visits.scheduled_end_at is 'Window end for range visits; null means single-point time at scheduled_for.';
comment on column public.patient_visits.time_window_label is 'Optional display label (e.g. 8–11 AM).';
comment on column public.patient_visits.created_from is 'Provenance: admin_dispatch, workspace_phone, patient_visits_page, etc.';
comment on column public.patient_visits.patient_phone_snapshot is 'Digits snapshot at schedule time for dispatch display.';
comment on column public.patient_visits.address_snapshot is 'Address snapshot at schedule time for dispatch display.';
comment on column public.patient_visits.notify_patient_on_schedule is 'Whether schedule flow requested patient SMS.';
comment on column public.patient_visits.notify_clinician_on_schedule is 'Whether schedule flow requested clinician SMS.';
comment on column public.patient_visits.dispatch_patient_notified_at is 'When dispatch patient SMS was sent for this row.';
comment on column public.patient_visits.dispatch_clinician_notified_at is 'When dispatch clinician SMS was sent for this row.';

alter table public.staff_profiles
  add column if not exists sms_notify_phone text;

comment on column public.staff_profiles.sms_notify_phone is 'Mobile for operational SMS (dispatch alerts); digits or E.164.';
