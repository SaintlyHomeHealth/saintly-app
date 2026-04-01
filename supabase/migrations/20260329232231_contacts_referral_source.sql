-- Phase 3 SMS inbox: allow capturing referral source directly on contacts.

alter table public.contacts
  add column if not exists referral_source text;

