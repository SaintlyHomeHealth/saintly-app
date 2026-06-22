/**
 * Canonical inbound missed / voicemail disposition for phone_calls rows.
 */

export type PhoneCallDispositionRow = {
  status?: string | null;
  has_voicemail?: boolean | null;
  missed?: boolean | null;
  voicemail_recording_sid?: string | null;
  direction?: string | null;
  answered?: boolean | null;
};

/** True when the call should appear under Calls → Missed (includes Saintly voicemail). */
export function isMissedOrVoicemailCall(row: PhoneCallDispositionRow): boolean {
  const status = (row.status ?? "").trim().toLowerCase();
  if (status === "missed" || status === "voicemail") return true;
  if (row.has_voicemail === true || row.missed === true) return true;
  const vmSid = typeof row.voicemail_recording_sid === "string" ? row.voicemail_recording_sid.trim() : "";
  if (vmSid.length > 0) return true;
  const dir = (row.direction ?? "").trim().toLowerCase();
  if (dir === "inbound" && row.answered === false) return true;
  return false;
}

/** True when the row represents a Saintly voicemail recording. */
export function hasVoicemailArtifact(row: PhoneCallDispositionRow): boolean {
  if (row.has_voicemail === true) return true;
  const vmSid = typeof row.voicemail_recording_sid === "string" ? row.voicemail_recording_sid.trim() : "";
  return vmSid.length > 0;
}

/** PostgREST `.or()` filter for missed-call list queries. */
export const PHONE_CALLS_MISSED_OR_VOICEMAIL_OR_FILTER =
  "status.eq.missed,status.eq.voicemail,has_voicemail.eq.true,missed.eq.true,and(direction.eq.inbound,answered.eq.false)";

/** PostgREST filter for voicemail inbox (recording sid or disposition flag). */
export const PHONE_CALLS_VOICEMAIL_INBOX_OR_FILTER =
  "voicemail_recording_sid.not.is.null,has_voicemail.eq.true";

/** AND-combine voicemail inbox filter with assigned-line scope (PostgREST). */
export function phoneCallsVoicemailInboxFilter(scopeOr: string | null): string {
  if (!scopeOr) return PHONE_CALLS_VOICEMAIL_INBOX_OR_FILTER;
  return `and(or(${PHONE_CALLS_VOICEMAIL_INBOX_OR_FILTER}),or(${scopeOr}))`;
}
