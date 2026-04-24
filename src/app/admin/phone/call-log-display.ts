import type { SupabaseClient } from "@supabase/supabase-js";

import type { PhoneCallRow } from "@/app/admin/phone/recent-calls-live";
import { formatCrmOutcomeLabel, readCrmMetadata } from "@/app/admin/phone/_lib/crm-metadata";
import { displayNameFromContactsRelation } from "@/lib/crm/contact-relation-display-name";
import {
  phoneRawToE164LookupKey,
  resolvePhoneDisplayIdentityBatch,
} from "@/lib/phone/resolve-phone-display-identity";

function mapMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

/** Maps `phone_calls` select row to `PhoneCallRow` (shared shape with legacy phone UI). */
export function mapPhoneCallQueryRowForLog(raw: Record<string, unknown>): PhoneCallRow {
  const crm_contact_display_name = displayNameFromContactsRelation(raw.contacts);

  return {
    id: String(raw.id),
    created_at: String(raw.created_at),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : String(raw.created_at),
    external_call_id: String(raw.external_call_id),
    direction: String(raw.direction),
    from_e164: typeof raw.from_e164 === "string" ? raw.from_e164 : null,
    to_e164: typeof raw.to_e164 === "string" ? raw.to_e164 : null,
    status: String(raw.status),
    started_at: typeof raw.started_at === "string" ? raw.started_at : null,
    ended_at: typeof raw.ended_at === "string" ? raw.ended_at : null,
    duration_seconds: (() => {
      const d = raw.duration_seconds;
      if (typeof d === "number" && Number.isFinite(d)) return Math.round(d);
      if (typeof d === "string" && d.trim() !== "") {
        const n = Number.parseInt(d, 10);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    })(),
    voicemail_recording_sid: typeof raw.voicemail_recording_sid === "string" ? raw.voicemail_recording_sid : null,
    voicemail_duration_seconds: (() => {
      const d = raw.voicemail_duration_seconds;
      if (typeof d === "number" && Number.isFinite(d)) return Math.round(d);
      if (typeof d === "string" && d.trim() !== "") {
        const n = Number.parseInt(d, 10);
        return Number.isFinite(n) ? n : null;
      }
      return null;
    })(),
    priority_sms_sent_at: typeof raw.priority_sms_sent_at === "string" ? raw.priority_sms_sent_at : null,
    priority_sms_reason: typeof raw.priority_sms_reason === "string" ? raw.priority_sms_reason : null,
    auto_reply_sms_sent_at: typeof raw.auto_reply_sms_sent_at === "string" ? raw.auto_reply_sms_sent_at : null,
    auto_reply_sms_body: typeof raw.auto_reply_sms_body === "string" ? raw.auto_reply_sms_body : null,
    assigned_to_user_id: typeof raw.assigned_to_user_id === "string" ? raw.assigned_to_user_id : null,
    assigned_at: typeof raw.assigned_at === "string" ? raw.assigned_at : null,
    assigned_to_label: typeof raw.assigned_to_label === "string" ? raw.assigned_to_label : null,
    primary_tag: typeof raw.primary_tag === "string" ? raw.primary_tag : null,
    contact_id: typeof raw.contact_id === "string" ? raw.contact_id : null,
    resolved_contact_id: null,
    crm_contact_display_name,
    metadata: mapMetadata(raw.metadata),
  };
}

/** Human-readable pipeline status for the log (not raw Twilio enum). */
export function formatCallLogStatus(status: string): string {
  const s = status.trim().toLowerCase();
  switch (s) {
    case "completed":
      return "Answered";
    case "missed":
      return "Missed";
    case "voicemail":
      return "Voicemail";
    case "abandoned":
      return "Abandoned";
    case "in_progress":
      return "In progress";
    case "ringing":
      return "Ringing";
    case "initiated":
      return "Initiated";
    case "failed":
      return "Failed";
    case "cancelled":
      return "Cancelled";
    case "unknown":
      return "Unknown";
    default:
      return s ? s.replace(/_/g, " ") : "—";
  }
}

/**
 * Disposition / outcome column: CRM drawer outcome, else inferred from call status.
 */
export function formatCallLogOutcome(row: PhoneCallRow): string {
  const crm = readCrmMetadata(row);
  const labeled = formatCrmOutcomeLabel(crm.outcome);
  if (labeled) return labeled;

  const tag = (row.primary_tag ?? "").trim().toLowerCase();
  if (tag === "spam") return "Spam";

  const st = (row.status ?? "").trim().toLowerCase();
  if (st === "voicemail") return "Voicemail left";
  if (st === "completed") return "Answered";
  if (st === "missed") return "—";
  if (st === "abandoned") return "No answer";

  return "—";
}

export function callerPartyE164(direction: string, from_e164: string | null, to_e164: string | null): string | null {
  const d = direction.trim().toLowerCase();
  if (d === "inbound") {
    return from_e164?.trim() || null;
  }
  if (d === "outbound") {
    return to_e164?.trim() || null;
  }
  return from_e164?.trim() || to_e164?.trim() || null;
}

/** Merge phone-directory resolution into call-log rows (server render + refresh). */
export async function enrichPhoneCallRowsWithResolvedIdentity(
  supabase: SupabaseClient,
  rows: PhoneCallRow[]
): Promise<PhoneCallRow[]> {
  const parties = rows.map((r) => callerPartyE164(r.direction, r.from_e164, r.to_e164));
  const batch = await resolvePhoneDisplayIdentityBatch(supabase, parties);
  return rows.map((row) => {
    const party = callerPartyE164(row.direction, row.from_e164, row.to_e164);
    const key = phoneRawToE164LookupKey(party ?? "");
    const id = key ? batch.get(key) : undefined;
    const embed = row.crm_contact_display_name?.trim() || null;

    let crmName: string | null = null;
    if (id?.resolvedFromEntity && id.displayTitle.trim()) {
      crmName = id.displayTitle.trim();
    } else if (embed) {
      crmName = embed;
    } else if (id?.displayTitle?.trim()) {
      crmName = id.displayTitle.trim();
    }

    const resolved_contact_id =
      !row.contact_id && id?.contactId && (id.entityType === "contact" || id.entityType === "patient" || id.entityType === "lead")
        ? id.contactId
        : null;

    return {
      ...row,
      crm_contact_display_name: crmName,
      resolved_contact_id,
      party_display_suppress_quick_save: Boolean(id?.suppressQuickSave),
    };
  });
}
