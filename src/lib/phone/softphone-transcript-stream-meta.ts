/** Stored under `phone_calls.metadata.voice_ai.softphone_transcript_streams`. */
export type SoftphoneTranscriptStreamsMeta = {
  client_stream_sid?: string | null;
  client_stream_started_at?: string | null;
  pstn_call_sid_at_attempt?: string | null;
  pstn_stream_sid?: string | null;
  pstn_stream_started_at?: string | null;
  pstn_stream_last_error?: string | null;
  pstn_stream_last_attempt_at?: string | null;
};
