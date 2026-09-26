-- Opening a fax did not set is_read, so Fax Center counted reviewed inbound
-- faxes as unread. Mark inbound faxes that arrived before this correction as
-- read. Faxes received after the cutoff stay unread until someone opens them.

update public.fax_messages
set is_read = true
where direction = 'inbound'
  and is_read = false
  and coalesce(received_at, created_at) < timestamptz '2026-09-26 18:06:00+00';
