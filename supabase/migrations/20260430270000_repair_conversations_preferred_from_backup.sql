-- One-time repair: default outbound sender is +14803600008. Conversations that only had the backup
-- long code (+14805712062) auto-stamped from inbound routing are reset to primary unless the user
-- explicitly locked the backup line (metadata.sms_outbound_from_explicit = true).

update public.conversations
set
  preferred_from_e164 = '+14803600008',
  updated_at = now()
where channel = 'sms'
  and trim(preferred_from_e164) = '+14805712062'
  and not (
    coalesce(metadata, '{}'::jsonb) @> '{"sms_outbound_from_explicit": true}'::jsonb
  );

comment on column public.conversations.preferred_from_e164 is
  'Optional E.164 of the business line for outbound SMS (softphone allowlist). Backup line (+14805712062) is honored only when metadata.sms_outbound_from_explicit is true.';
