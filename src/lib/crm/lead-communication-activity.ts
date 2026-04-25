/**
 * Logs phone/SMS touches to `lead_activities` for the CRM timeline.
 *
 * Policy: this module MUST NOT update `leads.status` (pipeline), `leads.last_outcome`,
 * or other lead outcome fields. Pipeline and "spoke" state change only from explicit
 * CRM controls (e.g. contact outcome form, quick "mark spoke").
 */
import "server-only";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function previewText(body: string, max = 100): string {
  const t = body.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function listActiveLeadIdsForContactId(contactId: string | null | undefined): Promise<string[]> {
  const cid = typeof contactId === "string" ? contactId.trim() : "";
  if (!cid || !UUID_RE.test(cid)) return [];

  const { data, error } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("id").eq("contact_id", cid)
  );

  if (error) {
    console.warn("[lead-communication-activity] list leads by contact:", error.message);
    return [];
  }
  return (data ?? []).map((r) => String(r.id)).filter(Boolean);
}

async function listActiveLeadIdsForPartyPhone(partyE164: string | null | undefined): Promise<string[]> {
  const raw = typeof partyE164 === "string" ? partyE164.trim() : "";
  if (!raw) return [];
  const match = await findContactByIncomingPhone(supabaseAdmin, raw);
  if (!match?.id) return [];
  return listActiveLeadIdsForContactId(match.id);
}

/** Resolve CRM leads tied to this contact and/or this normalized party phone. */
export async function resolveActiveLeadIdsForCommunication(input: {
  contactId: string | null | undefined;
  partyPhoneE164: string | null | undefined;
}): Promise<string[]> {
  const ids = new Set<string>();
  for (const id of await listActiveLeadIdsForContactId(input.contactId)) {
    ids.add(id);
  }
  for (const id of await listActiveLeadIdsForPartyPhone(input.partyPhoneE164)) {
    ids.add(id);
  }
  return [...ids];
}

async function staffShortLabel(userId: string | null | undefined): Promise<string | null> {
  const uid = typeof userId === "string" ? userId.trim() : "";
  if (!uid) return null;
  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("full_name, email")
    .eq("user_id", uid)
    .maybeSingle();
  if (error || !data) return null;
  const fn = typeof data.full_name === "string" ? data.full_name.trim() : "";
  if (fn) return fn;
  const em = typeof data.email === "string" ? data.email.trim() : "";
  return em || null;
}

function formatDurationSeconds(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const n = Math.floor(sec);
  const m = Math.floor(n / 60);
  const s = n % 60;
  if (m === 0) return `${s}s`;
  return `${m}m ${s}s`;
}

function callDisplayDirection(
  direction: string | null | undefined,
  status: string | null | undefined
): "incoming" | "outgoing" | "missed" {
  const d = String(direction ?? "").toLowerCase();
  const s = String(status ?? "").toLowerCase();
  if (d === "outbound") return "outgoing";
  if (d === "inbound") {
    if (
      s === "missed" ||
      s === "failed" ||
      s === "cancelled" ||
      s === "no-answer" ||
      s === "no_answer" ||
      s === "abandoned" ||
      s === "busy"
    ) {
      return "missed";
    }
    return "incoming";
  }
  return "incoming";
}

async function leadActivityExistsWithMetadataKey(
  leadId: string,
  eventType: string,
  key: string,
  value: string
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("lead_activities")
    .select("id")
    .eq("lead_id", leadId)
    .eq("event_type", eventType)
    .is("deleted_at", null)
    .contains("metadata", { [key]: value })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[lead-communication-activity] idempotency check:", error.message);
    return false;
  }
  return Boolean(data?.id);
}

function revalidateLeadPaths(leadIds: string[]): void {
  for (const id of leadIds) {
    if (id && UUID_RE.test(id)) {
      revalidatePath(`/admin/crm/leads/${id}`);
    }
  }
  revalidatePath("/admin/crm/leads");
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/workspace/phone/chat");
}

/**
 * After a call reaches a terminal status, append one timeline row per related lead (idempotent per call).
 */
export async function logTerminalPhoneCallForLeadTimeline(phoneCallId: string): Promise<void> {
  const cid = typeof phoneCallId === "string" ? phoneCallId.trim() : "";
  if (!cid || !UUID_RE.test(cid)) return;

  try {
    const { data: row, error } = await supabaseAdmin
      .from("phone_calls")
      .select(
        "id, direction, status, duration_seconds, from_e164, to_e164, contact_id, assigned_to_user_id, external_call_id, ended_at, created_at"
      )
      .eq("id", cid)
      .maybeSingle();

    if (error || !row?.id) {
      console.warn("[lead-communication-activity] load phone_call:", error?.message);
      return;
    }

    const direction = typeof row.direction === "string" ? row.direction : "";
    const status = typeof row.status === "string" ? row.status : "";
    const partyE164 =
      direction.toLowerCase() === "outbound"
        ? typeof row.to_e164 === "string"
          ? row.to_e164.trim()
          : ""
        : typeof row.from_e164 === "string"
          ? row.from_e164.trim()
          : "";

    const contactId =
      row.contact_id != null && String(row.contact_id).trim() !== "" ? String(row.contact_id) : null;

    const leadIds = await resolveActiveLeadIdsForCommunication({
      contactId,
      partyPhoneE164: partyE164 || null,
    });
    if (leadIds.length === 0) return;

    const displayDir = callDisplayDirection(direction, status);
    const phoneDisp = partyE164 ? formatPhoneForDisplay(partyE164) || partyE164 : "—";
    const dur = formatDurationSeconds(
      typeof row.duration_seconds === "number" ? row.duration_seconds : null
    );
    const staffLabel = await staffShortLabel(
      row.assigned_to_user_id != null ? String(row.assigned_to_user_id) : null
    );

    const dirLabel =
      displayDir === "outgoing" ? "Outgoing call" : displayDir === "missed" ? "Missed call" : "Incoming call";

    const bodyParts = [
      `${dirLabel} · ${phoneDisp}`,
      `Duration ${dur}`,
      `Status ${status || "—"}`,
    ];
    if (staffLabel) bodyParts.push(`Staff ${staffLabel}`);

    const occurredAt =
      row.ended_at != null && String(row.ended_at).trim() !== ""
        ? String(row.ended_at)
        : row.created_at != null && String(row.created_at).trim() !== ""
          ? String(row.created_at)
          : new Date().toISOString();

    const metadata: Record<string, unknown> = {
      communication_kind: "call",
      direction: direction.toLowerCase(),
      display_direction: displayDir,
      phone_e164: partyE164 || null,
      phone_call_id: cid,
      duration_seconds:
        typeof row.duration_seconds === "number" && Number.isFinite(row.duration_seconds)
          ? row.duration_seconds
          : null,
      status: status || null,
      assigned_to_user_id:
        row.assigned_to_user_id != null && String(row.assigned_to_user_id).trim() !== ""
          ? String(row.assigned_to_user_id)
          : null,
      external_call_id:
        row.external_call_id != null && String(row.external_call_id).trim() !== ""
          ? String(row.external_call_id)
          : null,
      contact_id: contactId,
      occurred_at: occurredAt,
    };

    const assignee =
      row.assigned_to_user_id != null && String(row.assigned_to_user_id).trim() !== ""
        ? String(row.assigned_to_user_id)
        : null;

    for (const leadId of leadIds) {
      const exists = await leadActivityExistsWithMetadataKey(
        leadId,
        LEAD_ACTIVITY_EVENT.communication_phone_call,
        "phone_call_id",
        cid
      );
      if (exists) continue;

      const { error: insErr } = await supabaseAdmin.from("lead_activities").insert({
        lead_id: leadId,
        event_type: LEAD_ACTIVITY_EVENT.communication_phone_call,
        body: bodyParts.join(" · "),
        metadata,
        created_by_user_id: assignee,
        deletable: false,
        created_at: occurredAt,
      });
      if (insErr) {
        console.warn("[lead-communication-activity] insert call activity:", insErr.message);
      }
    }

    revalidateLeadPaths(leadIds);
  } catch (e) {
    console.warn("[lead-communication-activity] logTerminalPhoneCallForLeadTimeline:", e);
  }
}

/**
 * One timeline line per SMS message (short preview only; full text stays in the inbox thread).
 */
export async function logSmsMessageForLeadTimeline(input: {
  direction: "inbound" | "outbound";
  contactId: string | null | undefined;
  partyPhoneE164: string;
  conversationId: string;
  messageId: string;
  body: string;
  createdByUserId?: string | null;
}): Promise<void> {
  const mid = typeof input.messageId === "string" ? input.messageId.trim() : "";
  const conv = typeof input.conversationId === "string" ? input.conversationId.trim() : "";
  if (!mid || !UUID_RE.test(mid) || !conv || !UUID_RE.test(conv)) return;

  try {
    const leadIds = await resolveActiveLeadIdsForCommunication({
      contactId: input.contactId,
      partyPhoneE164: input.partyPhoneE164,
    });
    if (leadIds.length === 0) return;

    const phoneDisp = input.partyPhoneE164
      ? formatPhoneForDisplay(input.partyPhoneE164) || input.partyPhoneE164
      : "—";
    const prev = previewText(input.body, 90);
    const dirLabel = input.direction === "outbound" ? "Outbound SMS" : "Inbound SMS";
    const bodyLine =
      prev.length > 0 ? `${dirLabel} · ${phoneDisp} · ${prev}` : `${dirLabel} · ${phoneDisp}`;

    const metadata: Record<string, unknown> = {
      communication_kind: "sms",
      direction: input.direction,
      phone_e164: input.partyPhoneE164.trim(),
      conversation_id: conv,
      message_id: mid,
      preview: prev || null,
      contact_id:
        input.contactId != null && String(input.contactId).trim() !== ""
          ? String(input.contactId).trim()
          : null,
      occurred_at: new Date().toISOString(),
    };

    const creator =
      input.direction === "outbound" && input.createdByUserId?.trim()
        ? input.createdByUserId.trim()
        : null;

    for (const leadId of leadIds) {
      const exists = await leadActivityExistsWithMetadataKey(
        leadId,
        LEAD_ACTIVITY_EVENT.communication_sms,
        "message_id",
        mid
      );
      if (exists) continue;

      const { error: insErr } = await supabaseAdmin.from("lead_activities").insert({
        lead_id: leadId,
        event_type: LEAD_ACTIVITY_EVENT.communication_sms,
        body: bodyLine,
        metadata,
        created_by_user_id: creator,
        deletable: false,
      });
      if (insErr) {
        console.warn("[lead-communication-activity] insert sms activity:", insErr.message);
      }
    }

    revalidateLeadPaths(leadIds);
  } catch (e) {
    console.warn("[lead-communication-activity] logSmsMessageForLeadTimeline:", e);
  }
}
