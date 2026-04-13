/**
 * Persisted under `phone_calls.metadata.softphone_recording` for workspace manual recording.
 */

export type SoftphoneRecordingSource = "conference" | "pstn_leg" | "client_leg";

export type SoftphoneRecordingStatus = "idle" | "in-progress" | "stopped" | "failed";

export type SoftphoneRecordingMeta = {
  recording_sid: string | null;
  source: SoftphoneRecordingSource | null;
  status: SoftphoneRecordingStatus;
  started_at: string | null;
  stopped_at: string | null;
  last_error_message: string | null;
  updated_at?: string;
};

export function defaultSoftphoneRecordingMeta(): SoftphoneRecordingMeta {
  return {
    recording_sid: null,
    source: null,
    status: "idle",
    started_at: null,
    stopped_at: null,
    last_error_message: null,
  };
}
