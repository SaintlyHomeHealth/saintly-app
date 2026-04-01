-- CRM classification tag per call (staff-editable).

alter table public.phone_calls
  add column if not exists primary_tag text;

alter table public.phone_calls drop constraint if exists phone_calls_primary_tag_check;

alter table public.phone_calls
  add constraint phone_calls_primary_tag_check check (
    primary_tag is null
    or primary_tag in (
      'patient',
      'referral',
      'caregiver',
      'family',
      'vendor',
      'spam',
      'other'
    )
  );

create index if not exists phone_calls_primary_tag_idx on public.phone_calls (primary_tag);
