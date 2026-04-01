-- Live incoming-call alerts (created when inbound hits /api/twilio/voice; resolved when the call ends).
-- Separate from phone_call_notifications (missed_call / voicemail follow-up workflow).

create table if not exists public.incoming_call_alerts (
  id uuid primary key default gen_random_uuid(),
  phone_call_id uuid not null references public.phone_calls (id) on delete cascade,
  external_call_id text not null,
  from_e164 text,
  to_e164 text,
  status text not null default 'new',
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  constraint incoming_call_alerts_external_call_id_unique unique (external_call_id),
  constraint incoming_call_alerts_status_check check (
    status in ('new', 'acknowledged', 'resolved')
  )
);

create index if not exists incoming_call_alerts_status_created_idx
  on public.incoming_call_alerts (status, created_at desc);

create index if not exists incoming_call_alerts_phone_call_id_idx
  on public.incoming_call_alerts (phone_call_id);

alter table public.incoming_call_alerts enable row level security;

drop policy if exists "incoming_call_alerts_select_admin" on public.incoming_call_alerts;
create policy "incoming_call_alerts_select_admin"
  on public.incoming_call_alerts
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );

drop policy if exists "incoming_call_alerts_update_admin" on public.incoming_call_alerts;
create policy "incoming_call_alerts_update_admin"
  on public.incoming_call_alerts
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = (select auth.uid())
        and sp.role in ('admin', 'super_admin')
    )
  );

-- Enable Realtime for future in-app subscriptions (staff consoles).
alter publication supabase_realtime add table public.incoming_call_alerts;
