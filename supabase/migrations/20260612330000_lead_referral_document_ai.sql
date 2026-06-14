-- Phase 26: AI referral document review fields.

alter table public.lead_referral_documents
  add column if not exists ai_processed_at timestamptz,
  add column if not exists ai_processing_error text,
  add column if not exists ai_confidence numeric;

create index if not exists lead_referral_documents_ai_processed_at_idx
  on public.lead_referral_documents (ai_processed_at desc)
  where ai_processed_at is not null;

comment on column public.lead_referral_documents.ai_processed_at is
  'When server-side AI extraction last completed for this document.';
comment on column public.lead_referral_documents.ai_processing_error is
  'Last AI processing error message (non-PHI).';
comment on column public.lead_referral_documents.ai_confidence is
  'AI extraction confidence score 0-1.';
