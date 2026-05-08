-- Outbound forward: new fax row created from an inbound fax document (audit trail).

alter table public.fax_messages
  add column if not exists forwarded_from_fax_message_id uuid references public.fax_messages (id) on delete set null;

create index if not exists fax_messages_forwarded_from_idx
  on public.fax_messages (forwarded_from_fax_message_id)
  where forwarded_from_fax_message_id is not null;

comment on column public.fax_messages.forwarded_from_fax_message_id is
  'When set on an outbound fax, this send was created by forwarding the document from the referenced inbound fax row.';
