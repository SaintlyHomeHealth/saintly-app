/** Stored under `phone_calls.metadata.voice_ai.softphone_transcript_streams`. */
export type SoftphoneTranscriptStreamsMeta = {
  /** @deprecated Legacy Media Streams bridge (Railway) — prefer realtime transcription fields */
  client_stream_sid?: string | null;
  /** @deprecated Legacy Media Streams */
  client_stream_started_at?: string | null;
  /** Twilio Real-Time Transcription session SID (GT…) on the browser/client leg */
  client_realtime_transcription_sid?: string | null;
  client_realtime_transcription_started_at?: string | null;
  client_realtime_transcription_stopped_at?: string | null;
  pstn_call_sid_at_attempt?: string | null;
  /** @deprecated Legacy Media Streams on PSTN leg */
  pstn_stream_sid?: string | null;
  /** @deprecated Legacy Media Streams */
  pstn_stream_started_at?: string | null;
  pstn_realtime_transcription_sid?: string | null;
  pstn_realtime_transcription_started_at?: string | null;
  pstn_realtime_transcription_stopped_at?: string | null;
  pstn_stream_last_error?: string | null;
  pstn_stream_last_attempt_at?: string | null;
};
