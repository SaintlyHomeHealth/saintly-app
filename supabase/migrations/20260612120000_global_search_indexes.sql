-- Global admin search performance helpers (pg_trgm + phone indexes)

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS contacts_email_trgm_idx
  ON public.contacts USING gin (lower(email) gin_trgm_ops)
  WHERE archived_at IS NULL AND email IS NOT NULL;

CREATE INDEX IF NOT EXISTS contacts_full_name_trgm_idx
  ON public.contacts USING gin (lower(full_name) gin_trgm_ops)
  WHERE archived_at IS NULL AND full_name IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_medicare_number_trgm_idx
  ON public.leads USING gin (lower(medicare_number) gin_trgm_ops)
  WHERE deleted_at IS NULL AND medicare_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS leads_referral_source_trgm_idx
  ON public.leads USING gin (lower(referral_source) gin_trgm_ops)
  WHERE deleted_at IS NULL AND referral_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS phone_calls_from_e164_idx
  ON public.phone_calls (from_e164);

CREATE INDEX IF NOT EXISTS phone_calls_to_e164_idx
  ON public.phone_calls (to_e164);

CREATE INDEX IF NOT EXISTS private_pay_invoices_billing_phone_idx
  ON public.private_pay_invoices (billing_phone);

CREATE INDEX IF NOT EXISTS fax_messages_sender_name_trgm_idx
  ON public.fax_messages USING gin (lower(sender_name) gin_trgm_ops)
  WHERE sender_name IS NOT NULL;
