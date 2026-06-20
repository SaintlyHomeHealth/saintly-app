-- Align voicemail thread message timestamps with the parent phone_calls event time.
UPDATE public.messages m
SET created_at = COALESCE(pc.voicemail_received_at, pc.started_at, pc.created_at)
FROM public.phone_calls pc
WHERE m.phone_call_id = pc.id
  AND m.message_type = 'voicemail'
  AND COALESCE(pc.voicemail_received_at, pc.started_at, pc.created_at) IS NOT NULL
  AND m.created_at IS DISTINCT FROM COALESCE(pc.voicemail_received_at, pc.started_at, pc.created_at);
