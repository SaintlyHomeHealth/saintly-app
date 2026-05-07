-- Outbound resend: new fax_messages row links back to the original attempt (audit trail).

alter table public.fax_messages
  add column if not exists resent_from_fax_message_id uuid references public.fax_messages (id) on delete set null;

create index if not exists fax_messages_resent_from_idx
  on public.fax_messages (resent_from_fax_message_id)
  where resent_from_fax_message_id is not null;

comment on column public.fax_messages.resent_from_fax_message_id is
  'When set on an outbound fax, this send was created as a resend of the referenced fax row.';
