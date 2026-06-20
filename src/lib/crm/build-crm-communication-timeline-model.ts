import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { parseLastNoteSegments } from "@/lib/crm/lead-contact-log";
import { LEAD_ACTIVITY_EVENT, leadActivityEventLabel } from "@/lib/crm/lead-activity-types";
import type { LeadActivityRow } from "@/lib/crm/lead-activities-timeline";
import {
  logPhoneTimestampDebug,
  resolvePhoneCallDisplayIso,
  resolveSmsMessageDisplayIso,
} from "@/lib/phone/phone-event-timestamp";

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
  /** When set on a lead view, hide pre-lead phone/SMS history from recycled numbers. */
  leadCreatedAt?: string | null;
  /** Party phone (E.164) — loads call rows not yet linked to contact_id. */
  partyPhoneE164?: string | null;
  lastNote: string | null | undefined;
  /** Merge structured activities when lead exists. */
  leadActivities: LeadActivityRow[];
};

function eventAtOrAfterLead(iso: string, leadCreatedAt: string | null | undefined): boolean {
  if (!leadCreatedAt || !leadCreatedAt.trim()) return true;
  const leadMs = Date.parse(leadCreatedAt);
  const eventMs = Date.parse(iso);
  if (Number.isNaN(leadMs) || Number.isNaN(eventMs)) return true;
  /** One minute grace for webhook/insert ordering races at intake. */
  return eventMs >= leadMs - 60_000;
}

/**
 * Loads SMS, calls, structured lead activities, and legacy note segments — merged newest-first for the shared CRM timeline UI.
 */
export async function buildCrmCommunicationTimelineModel(
  input: BuildCommunicationTimelineInput
): Promise<CommunicationTimelineRow[]> {
  const { contactId, leadId, workspaceSmsConversationId, leadCreatedAt, partyPhoneE164, lastNote, leadActivities } =
    input;
  const rows: CommunicationTimelineRow[] = [];
  const leadScopeActive = Boolean(leadId && leadCreatedAt && leadCreatedAt.trim());

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
      .select("id, created_at, direction, body, metadata, message_type, phone_call_id")
      .eq("conversation_id", conversationId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(SMS_LIMIT);

    const vmCallIds = [
      ...new Set(
        (msgRows ?? [])
          .filter((m) => String((m as { message_type?: unknown }).message_type ?? "sms") === "voicemail")
          .map((m) => {
            const pid = (m as { phone_call_id?: unknown }).phone_call_id;
            return pid != null && String(pid).trim() !== "" ? String(pid).trim() : null;
          })
          .filter((x): x is string => Boolean(x))
      ),
    ];

    const phoneCallById = new Map<string, Record<string, unknown>>();
    if (vmCallIds.length > 0) {
      const { data: vmCalls } = await supabaseAdmin
        .from("phone_calls")
        .select(
          "id, started_at, voicemail_received_at, created_at, has_voicemail, status, voicemail_recording_sid"
        )
        .in("id", vmCallIds);
      for (const c of vmCalls ?? []) {
        const id = typeof c.id === "string" ? c.id : "";
        if (id) phoneCallById.set(id, c as Record<string, unknown>);
      }
    }

    for (const m of msgRows ?? []) {
      const mid = typeof m.id === "string" ? m.id : "";
      if (!mid) continue;
      const phoneCallId =
        m.phone_call_id != null && String(m.phone_call_id).trim() !== "" ? String(m.phone_call_id).trim() : null;
      const phoneCall = phoneCallId ? phoneCallById.get(phoneCallId) ?? null : null;
      const resolved = resolveSmsMessageDisplayIso({
        created_at: m.created_at,
        metadata: m.metadata,
        message_type: m.message_type,
        phoneCall,
      });
      const at = resolved.iso ?? "";
      if (!at) continue;
      if (leadScopeActive && !eventAtOrAfterLead(at, leadCreatedAt)) continue;

      logPhoneTimestampDebug({
        context: `crm_timeline.sms.${mid}`,
        rawDbTimestamp: typeof m.created_at === "string" ? m.created_at : null,
        selectedDisplayTimestamp: at,
        source: resolved.source,
        formattedArizona: null,
      });

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

  const callRowsById = new Map<string, Record<string, unknown>>();

  async function ingestCallRows(callRows: Record<string, unknown>[] | null | undefined): Promise<void> {
    for (const call of callRows ?? []) {
      const cid = typeof call.id === "string" ? call.id : "";
      if (!cid || callRowsById.has(cid)) continue;
      callRowsById.set(cid, call);
    }
  }

  if (contactId) {
    const { data: callRows } = await supabaseAdmin
      .from("phone_calls")
      .select(
        "id, direction, status, started_at, voicemail_received_at, from_e164, to_e164, voicemail_recording_sid, duration_seconds, created_at, has_voicemail"
      )
      .eq("contact_id", contactId)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(CALL_LIMIT);
    await ingestCallRows((callRows ?? []) as Record<string, unknown>[]);
  }

  const party = typeof partyPhoneE164 === "string" ? partyPhoneE164.trim() : "";
  if (party) {
    const candidates = phoneLookupCandidates(party);
    if (candidates.length > 0) {
      const orParts = candidates.flatMap((c) => [`from_e164.eq.${c}`, `to_e164.eq.${c}`]);
      const { data: byPhoneRows } = await supabaseAdmin
        .from("phone_calls")
        .select(
          "id, direction, status, started_at, voicemail_received_at, from_e164, to_e164, voicemail_recording_sid, duration_seconds, created_at, has_voicemail"
        )
        .or(orParts.join(","))
        .order("started_at", { ascending: false, nullsFirst: false })
        .limit(CALL_LIMIT);
      await ingestCallRows((byPhoneRows ?? []) as Record<string, unknown>[]);
    }
  }

  for (const call of callRowsById.values()) {
      const resolved = resolvePhoneCallDisplayIso(call);
      const at = resolved.iso ?? "";
      const cid = typeof call.id === "string" ? call.id : "";
      if (!at || !cid) continue;
      if (leadScopeActive && !eventAtOrAfterLead(at, leadCreatedAt)) continue;

      logPhoneTimestampDebug({
        context: `crm_timeline.call.${cid}`,
        rawDbTimestamp:
          typeof call.started_at === "string"
            ? call.started_at
            : typeof call.created_at === "string"
              ? call.created_at
              : null,
        selectedDisplayTimestamp: at,
        source: resolved.source,
        formattedArizona: null,
      });
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
