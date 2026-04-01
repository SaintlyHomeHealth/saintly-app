import type { PhoneCallRow } from "@/app/admin/phone/recent-calls-live";
import { formatCrmOutcomeLabel, readCrmMetadata } from "@/app/admin/phone/_lib/crm-metadata";

type ContactNameEmbed = { full_name?: unknown; first_name?: unknown; last_name?: unknown };

function crmDisplayNameFromContactsRaw(contactsRaw: unknown): string | null {
  let emb: ContactNameEmbed | null = null;
  if (contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)) {
    emb = contactsRaw as ContactNameEmbed;
  } else if (Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object") {
    emb = contactsRaw[0] as ContactNameEmbed;
  }
  const fn = emb && typeof emb.full_name === "string" ? emb.full_name.trim() : "";
  const f1 = emb && typeof emb.first_name === "string" ? emb.first_name : null;
  const f2 = emb && typeof emb.last_name === "string" ? emb.last_name : null;
  return fn || [f1, f2].filter(Boolean).join(" ").trim() || null;
}

function mapMetadata(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

/** Maps `phone_calls` select row to `PhoneCallRow` (shared shape with legacy phone UI). */
export function mapPhoneCallQueryRowForLog(raw: Record<string, unknown>): PhoneCallRow {
  const crm_contact_display_name = crmDisplayNameFromContactsRaw(raw.contacts);

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
