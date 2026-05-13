-- Cancel / soft-delete columns for signing packets + "canceled" status

alter table public.signature_packets
  drop constraint if exists signature_packets_status_check;

alter table public.signature_packets
  add constraint signature_packets_status_check
  check (
    status in (
      'draft',
      'sent',
      'viewed',
      'in_progress',
      'signed',
      'completed',
      'expired',
      'voided',
      'canceled'
    )
  );

alter table public.signature_packets
  add column if not exists canceled_at timestamptz,
  add column if not exists canceled_by uuid references auth.users (id) on delete set null,
  add column if not exists cancel_reason text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deleted_by uuid references auth.users (id) on delete set null;

create index if not exists signature_packets_deleted_at_idx
  on public.signature_packets (deleted_at)
  where deleted_at is not null;

create index if not exists signature_packets_canceled_at_idx
  on public.signature_packets (canceled_at)
  where canceled_at is not null;

comment on column public.signature_packets.canceled_at is
  'When set, signing links are invalid (see recipient token_expires_at updates). Distinct from voided.';
comment on column public.signature_packets.deleted_at is
  'Soft-remove from admin list; does not delete stored signed PDF objects.';
