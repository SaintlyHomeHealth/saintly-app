-- Internal CRM notes on phone_calls (staff-only reads; writes via server action + service role).

create table if not exists public.phone_call_notes (
  id uuid primary key default gen_random_uuid(),
  phone_call_id uuid not null references public.phone_calls (id) on delete cascade,
  body text not null,
  created_by_user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists phone_call_notes_call_created_idx
  on public.phone_call_notes (phone_call_id, created_at desc);

alter table public.phone_call_notes enable row level security;

drop policy if exists "phone_call_notes_select_staff" on public.phone_call_notes;
create policy "phone_call_notes_select_staff"
  on public.phone_call_notes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.staff_profiles sp
      where sp.user_id = auth.uid()
        and sp.role in ('admin', 'super_admin', 'manager')
    )
  );
