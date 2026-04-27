import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { parseLastNoteSegments } from "@/lib/crm/lead-contact-log";
import { LEAD_ACTIVITY_EVENT, leadActivityEventLabel } from "@/lib/crm/lead-activity-types";
import type { LeadActivityRow } from "@/lib/crm/lead-activities-timeline";

const SMS_LIMIT = 80;
const CALL_LIMIT = 40;

/** Activity rows treated as pipeline / status (shown in “All”, not in SMS/Calls/Notes-only filters). */
const STATUS_EVENT_TYPES: ReadonlySet<string> = new Set([
  LEAD_ACTIVITY_EVENT.status_changed,
  LEAD_ACTIVITY_EVENT.marked_dead,
  LEAD_ACTIVITY_EVENT.converted,
  LEAD_ACTIVITY_EVENT.owner_changed,
  LEAD_ACTIVITY_EVENT.follow_up_changed,
  LEAD_ACTIVITY_EVENT.next_action_changed,
  LEAD_ACTIVITY_EVENT.lead_temperature_updated,
]);

const NOTE_ACTIVITY_TYPES: ReadonlySet<string> = new Set([
  LEAD_ACTIVITY_EVENT.manual_note,
  LEAD_ACTIVITY_EVENT.lead_notes_updated,
  LEAD_ACTIVITY_EVENT.contact_attempt,
]);

function ms(iso: string): number {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
}

export type CommunicationTimelineRow =
  | {
      kind: "sms";
      sortMs: number;
      id: string;
      createdAt: string;
      direction: string;
      body: string;
      conversationId: string;
    }
  | {
      kind: "call";
      sortMs: number;
      id: string;
      createdAt: string;
      direction: string;
      status: string;
      durationSeconds: number | null;
      hasVm: boolean;
      summaryLine: string;
      fromE164: string | null;
      toE164: string | null;
    }
  | { kind: "note"; sortMs: number; id: string; createdAt: string; title: string; body: string }
  | { kind: "status"; sortMs: number; id: string; createdAt: string; label: string; body: string }
  /** `crm_stage_changed` activity — rendered as a compact “Stage history” line in the UI. */
  | { kind: "stage_history"; sortMs: number; id: string; createdAt: string; body: string };

export type BuildCommunicationTimelineInput = {
  contactId: string;
  leadId: string | null;
  /** Prefer inbox deep-link when known (same as lead workspace). */
  workspaceSmsConversationId: string | null;
  lastNote: string | null | undefined;
  /** Merge structured activities when lead exists. */
  leadActivities: LeadActivityRow[];
};

/**
 * Loads SMS, calls, structured lead activities, and legacy note segments — merged newest-first for the shared CRM timeline UI.
 */
export async function buildCrmCommunicationTimelineModel(
  input: BuildCommunicationTimelineInput
): Promise<CommunicationTimelineRow[]> {
  const { contactId, leadId, workspaceSmsConversationId, lastNote, leadActivities } = input;
  const rows: CommunicationTimelineRow[] = [];

  let conversationId = workspaceSmsConversationId;
  if (!conversationId && contactId) {
    const { data: conv } = await supabaseAdmin
      .from("conversations")
      .select("id")
      .eq("channel", "sms")
      .eq("primary_contact_id", contactId)
      .is("deleted_at", null)
      .maybeSingle();
    conversationId = conv?.id ? String(conv.id) : null;
  }

  if (conversationId) {
    const { data: msgRows } = await supabaseAdmin
      .from("messages")
      .select("id, created_at, direction, body")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(SMS_LIMIT);

    for (const m of msgRows ?? []) {
      const at = typeof m.created_at === "string" ? m.created_at : "";
      const mid = typeof m.id === "string" ? m.id : "";
      if (!at || !mid) continue;
      const dir = String(m.direction ?? "").toLowerCase() === "inbound" ? "Inbound" : "Outbound";
      const body = typeof m.body === "string" ? m.body.trim().slice(0, 500) : "";
      rows.push({
        kind: "sms",
        sortMs: ms(at),
        id: mid,
        createdAt: at,
        direction: dir,
        body: body || "—",
        conversationId,
      });
    }
  }

  if (contactId) {
    const { data: callRows } = await supabaseAdmin
      .from("phone_calls")
      .select(
        "id, direction, status, started_at, from_e164, to_e164, voicemail_recording_sid, duration_seconds, created_at"
      )
      .eq("contact_id", contactId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(CALL_LIMIT);

    for (const call of callRows ?? []) {
      const at =
        typeof call.started_at === "string"
          ? call.started_at
          : typeof call.created_at === "string"
            ? call.created_at
            : "";
      const cid = typeof call.id === "string" ? call.id : "";
      if (!at || !cid) continue;
      const dir = String(call.direction ?? "").toLowerCase() === "inbound" ? "Inbound" : "Outbound";
      const vm =
        typeof call.voicemail_recording_sid === "string" && call.voicemail_recording_sid.trim() !== "";
      const dur =
        typeof call.duration_seconds === "number" && Number.isFinite(call.duration_seconds)
          ? call.duration_seconds
          : null;
      const statusStr = String(call.status ?? "");
      const sub = `${dir} · ${statusStr}${dur != null ? ` · ${dur}s` : ""}`;
      rows.push({
        kind: "call",
        sortMs: ms(at),
        id: cid,
        createdAt: at,
        direction: dir,
        status: statusStr,
        durationSeconds: dur,
        hasVm: vm,
        summaryLine: sub,
        fromE164: typeof call.from_e164 === "string" ? call.from_e164 : null,
        toE164: typeof call.to_e164 === "string" ? call.to_e164 : null,
      });
    }
  }

  const segments = parseLastNoteSegments(lastNote);
  let segIdx = 0;
  for (const seg of segments) {
    segIdx += 1;
    const atIso = new Date(seg.sortMs || 0).toISOString();
    const body =
      [seg.body?.trim(), seg.meta?.trim()].filter(Boolean).join("\n").trim() ||
      seg.title ||
      "—";
    rows.push({
      kind: "note",
      sortMs: seg.sortMs || 0,
      id: `legacy-note-${segIdx}-${seg.sortMs}`,
      createdAt: atIso,
      title: seg.title || "Contact log",
      body,
    });
  }

  for (const a of leadActivities) {
    const at = typeof a.created_at === "string" ? a.created_at : "";
    if (!at) continue;
    const et = typeof a.event_type === "string" ? a.event_type.trim().toLowerCase() : "";
    if (et === LEAD_ACTIVITY_EVENT.communication_sms || et === LEAD_ACTIVITY_EVENT.communication_phone_call) {
      continue;
    }

    const body = typeof a.body === "string" ? a.body.trim() : "";
    if (et === LEAD_ACTIVITY_EVENT.crm_stage_changed) {
      rows.push({
        kind: "stage_history",
        sortMs: ms(at),
        id: a.id,
        createdAt: at,
        body: body || "—",
      });
      continue;
    }
    if (STATUS_EVENT_TYPES.has(et)) {
      rows.push({
        kind: "status",
        sortMs: ms(at),
        id: a.id,
        createdAt: at,
        label: leadActivityEventLabel(et),
        body: body || "—",
      });
      continue;
    }

    if (NOTE_ACTIVITY_TYPES.has(et)) {
      rows.push({
        kind: "note",
        sortMs: ms(at),
        id: a.id,
        createdAt: at,
        title: leadActivityEventLabel(et),
        body: body || "—",
      });
    }
  }

  rows.sort((a, b) => b.sortMs - a.sortMs);
  return rows;
}
