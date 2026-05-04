-- Speeds CRM leads list SMS thread lookups and inbox thread resolution by primary contact.

create index if not exists conversations_sms_primary_contact_deleted_at_null_idx
  on public.conversations (channel, primary_contact_id)
  where deleted_at is null;
