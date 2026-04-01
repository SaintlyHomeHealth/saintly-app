-- Call ownership for staff follow-up (CRM foundation).

alter table public.phone_calls
  add column if not exists assigned_to_user_id uuid references auth.users (id) on delete set null,
  add column if not exists assigned_at timestamptz,
  add column if not exists assigned_to_label text;

comment on column public.phone_calls.assigned_to_label is
  'Denormalized display (e.g. staff email at claim time) for admin UI without joining auth.users.';

create index if not exists phone_calls_assigned_to_user_id_idx
  on public.phone_calls (assigned_to_user_id)
  where assigned_to_user_id is not null;
