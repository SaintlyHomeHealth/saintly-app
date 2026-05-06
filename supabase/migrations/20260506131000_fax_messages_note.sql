-- Fax Center: staff-editable note for labeling faxes (inbound and outbound).

alter table public.fax_messages
  add column if not exists note text;

comment on column public.fax_messages.note is 'Staff-entered description of what the fax was for; not tied to CRM matching.';
