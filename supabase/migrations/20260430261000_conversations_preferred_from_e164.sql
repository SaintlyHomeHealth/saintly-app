-- Locked outbound sender (E.164) for workspace SMS threads — set from inbound "To", explicit send, or first manual pick.

alter table public.conversations
  add column if not exists preferred_from_e164 text null;

comment on column public.conversations.preferred_from_e164 is
  'Optional E.164 of the business line to use for outbound SMS on this thread (softphone allowlist).';
