/**
 * Twilio Conference helpers for workspace softphone (no marketplace plugins).
 * Room names are deterministic from the browser Client leg CallSid so webhooks can correlate rows.
 */

export const SOFTPHONE_CONFERENCE_ROOM_PREFIX = "sf";

/** Stable friendly name for a Client outbound leg (Twilio CallSid is CA…). */
export function softphoneConferenceRoomName(clientCallSid: string): string {
  const sid = clientCallSid.trim();
  return `${SOFTPHONE_CONFERENCE_ROOM_PREFIX}-${sid}`;
}

/** Resolve Client CallSid from conference FriendlyName (inverse of {@link softphoneConferenceRoomName}). */
export function clientCallSidFromConferenceFriendlyName(friendlyName: string): string | null {
  const t = friendlyName.trim();
  const prefix = `${SOFTPHONE_CONFERENCE_ROOM_PREFIX}-`;
  if (!t.startsWith(prefix)) return null;
  const sid = t.slice(prefix.length).trim();
  return sid.startsWith("CA") && sid.length >= 34 ? sid : null;
}

export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type SoftphoneConferenceMeta = {
  friendly_name: string;
  conference_sid?: string;
  client_call_sid?: string;
  pstn_call_sid?: string;
  pstn_on_hold?: boolean;
  last_conference_event?: string;
  updated_at?: string;
};

export function isClientIdentityFrom(value: string | null | undefined): boolean {
  return Boolean(value && value.toLowerCase().includes("client:"));
}
