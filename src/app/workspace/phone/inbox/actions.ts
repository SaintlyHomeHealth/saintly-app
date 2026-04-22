"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { canStaffAccessConversationRow } from "@/lib/phone/staff-conversation-access";
import { mergeTelemetryOnSend } from "@/lib/phone/sms-suggestion-telemetry";
import { softDeleteSmsConversation, softDeleteSmsMessage } from "@/lib/phone/sms-soft-delete";
import { ensureSmsConversationForPhone } from "@/lib/phone/sms-conversation-thread";
import { resolveContactAndPhoneForWorkspaceNewSms } from "@/lib/phone/workspace-new-sms-resolve";
import { resolveManualInboxSmsFromOverride } from "@/lib/twilio/manual-inbox-sms-from";
import { logSmsDebug } from "@/lib/twilio/sms-debug";
import { sendSms } from "@/lib/twilio/send-sms";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { supabaseAdmin } from "@/lib/admin";

const SMS_BODY_MAX = 1600;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function requirePhoneMessagingStaff() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }
  return staff;
}

function revalidateSmsViews(conversationId: string) {
  revalidatePath("/admin/phone/messages");
  revalidatePath(`/admin/phone/messages/${conversationId}`);
  revalidatePath("/workspace/phone/inbox");
  revalidatePath("/workspace/phone/inbox/new");
  revalidatePath(`/workspace/phone/inbox/${conversationId}`);
}

/**
 * Soft-delete one inbound/outbound message (service role + staff access check).
 */
export async function deleteWorkspaceSmsMessage(
  conversationId: string,
  messageId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "forbidden" };
  }
  const result = await softDeleteSmsMessage(supabaseAdmin, staff, { conversationId, messageId });
  if (result.ok) {
    revalidateSmsViews(conversationId);
    revalidatePath("/workspace/phone/voicemail");
  }
  return result;
}

/**
 * Soft-delete the whole SMS thread for this inbox (conversation + all messages).
 */
export async function deleteWorkspaceSmsConversation(
  conversationId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "forbidden" };
  }
  const result = await softDeleteSmsConversation(supabaseAdmin, staff, { conversationId });
  if (result.ok) {
    revalidateSmsViews(conversationId);
  }
  return result;
}

/**
 * Voicemail tab list: soft-delete the thread voicemail message when present, else flag `phone_calls.metadata`.
 * Reuses `softDeleteSmsMessage` so behavior matches thread delete + 30-day cleanup.
 */
export async function softDeleteWorkspaceVoicemailListItem(
  phoneCallId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const id = typeof phoneCallId === "string" ? phoneCallId.trim() : "";
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, error: "invalid_id" };
  }

  const { data: callRow, error: callErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, assigned_to_user_id, metadata")
    .eq("id", id)
    .maybeSingle();

  if (callErr || !callRow?.id) {
    return { ok: false, error: "not_found" };
  }

  const assignedTo =
    callRow.assigned_to_user_id != null && String(callRow.assigned_to_user_id).trim() !== ""
      ? String(callRow.assigned_to_user_id)
      : null;

  if (!canStaffAccessConversationRow(staff, { assigned_to_user_id: assignedTo })) {
    return { ok: false, error: "forbidden" };
  }

  const { data: vmMsg, error: msgErr } = await supabaseAdmin
    .from("messages")
    .select("id, conversation_id, deleted_at")
    .eq("phone_call_id", id)
    .eq("message_type", "voicemail")
    .maybeSingle();

  if (msgErr) {
    console.warn("[voicemail-list-delete] message load:", msgErr.message);
    return { ok: false, error: "load_failed" };
  }

  const msgDeleted =
    vmMsg?.deleted_at != null && typeof vmMsg.deleted_at === "string" && vmMsg.deleted_at.trim() !== "";

  if (msgDeleted) {
    return { ok: true };
  }

  if (vmMsg?.id) {
    const conversationId = String(vmMsg.conversation_id);
    const messageId = String(vmMsg.id);
    const result = await softDeleteSmsMessage(supabaseAdmin, staff, { conversationId, messageId });
    if (!result.ok) {
      return result;
    }
    revalidateSmsViews(conversationId);
  } else {
    const prev =
      callRow.metadata != null && typeof callRow.metadata === "object" && !Array.isArray(callRow.metadata)
        ? { ...(callRow.metadata as Record<string, unknown>) }
        : {};
    if (typeof prev.voicemail_inbox_soft_deleted_at === "string" && prev.voicemail_inbox_soft_deleted_at.trim()) {
      revalidatePath("/workspace/phone/voicemail");
      return { ok: true };
    }
    prev.voicemail_inbox_soft_deleted_at = new Date().toISOString();
    const { error: upErr } = await supabaseAdmin.from("phone_calls").update({ metadata: prev }).eq("id", id);
    if (upErr) {
      console.warn("[voicemail-list-delete] metadata flag:", upErr.message);
      return { ok: false, error: "update_failed" };
    }
  }

  revalidatePath("/workspace/phone/voicemail");
  return { ok: true };
}

export type SmsComposeSearchRow = {
  id: string;
  label: string;
  /** Display phone */
  phone: string | null;
  kind: "contact" | "recruit";
};

/**
 * Typeahead for compose "To" field — CRM contacts + recruiting candidates (manager/don flows).
 */
export async function searchWorkspaceSmsComposeTargets(query: string): Promise<{
  contacts: SmsComposeSearchRow[];
  recruits: SmsComposeSearchRow[];
}> {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return { contacts: [], recruits: [] };
  }

  const q = typeof query === "string" ? query.trim() : "";
  if (q.length < 2) {
    return { contacts: [], recruits: [] };
  }

  const safe = q.replace(/[%_,()]/g, "").slice(0, 64);
  if (!safe) {
    return { contacts: [], recruits: [] };
  }

  const pattern = `%${safe}%`;

  const [cName, cPhone, rName, rPhone] = await Promise.all([
    supabaseAdmin
      .from("contacts")
      .select("id, full_name, first_name, last_name, primary_phone")
      .is("archived_at", null)
      .ilike("full_name", pattern)
      .order("full_name", { ascending: true, nullsFirst: false })
      .limit(8),
    supabaseAdmin
      .from("contacts")
      .select("id, full_name, first_name, last_name, primary_phone")
      .is("archived_at", null)
      .ilike("primary_phone", pattern)
      .limit(8),
    supabaseAdmin
      .from("recruiting_candidates")
      .select("id, full_name, phone")
      .ilike("full_name", pattern)
      .order("full_name", { ascending: true })
      .limit(8),
    supabaseAdmin
      .from("recruiting_candidates")
      .select("id, full_name, phone")
      .ilike("phone", pattern)
      .limit(8),
  ]);

  const contactRows = mergeUniqueById([...(cName.data ?? []), ...(cPhone.data ?? [])]);

  const contacts: SmsComposeSearchRow[] = contactRows.map((row) => {
    const fn =
      typeof row.full_name === "string" && row.full_name.trim()
        ? row.full_name.trim()
        : [row.first_name, row.last_name].filter(Boolean).join(" ").trim() || "Contact";
    return {
      id: String(row.id),
      label: fn,
      phone: typeof row.primary_phone === "string" ? row.primary_phone : null,
      kind: "contact" as const,
    };
  });

  const recruitRows = mergeUniqueById([...(rName.data ?? []), ...(rPhone.data ?? [])]);

  const recruits: SmsComposeSearchRow[] = recruitRows.map((row) => ({
    id: String(row.id),
    label: typeof row.full_name === "string" ? row.full_name.trim() || "Recruit" : "Recruit",
    phone: typeof row.phone === "string" ? row.phone : null,
    kind: "recruit" as const,
  }));

  return { contacts, recruits };
}

function mergeUniqueById<T extends { id: unknown }>(rows: T[]): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const row of rows) {
    const id = row.id != null ? String(row.id) : "";
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/**
 * Start (or reuse) an SMS thread, send Twilio outbound, persist `messages`, then open the thread.
 */
export async function sendWorkspaceNewSms(formData: FormData) {
  const staff = await requirePhoneMessagingStaff();

  const bodyRaw = formData.get("body");
  const body = typeof bodyRaw === "string" ? bodyRaw.trim().slice(0, SMS_BODY_MAX) : "";
  const phoneRaw = typeof formData.get("phone") === "string" ? formData.get("phone")!.toString() : "";
  const contactIdRaw = formData.get("contactId");
  const recruitIdRaw = formData.get("recruitingCandidateId");
  const contactId = typeof contactIdRaw === "string" ? contactIdRaw.trim() : "";
  const recruitingCandidateId = typeof recruitIdRaw === "string" ? recruitIdRaw.trim() : "";

  const err = (code: string): never => redirect(`/workspace/phone/inbox/new?err=${code}`);

  if (!body) {
    err("sms_empty");
  }

  const resolved = await resolveContactAndPhoneForWorkspaceNewSms({
    phoneRaw,
    contactId: contactId || null,
    recruitingCandidateId: recruitingCandidateId || null,
  });

  if (!resolved.ok) {
    redirect(`/workspace/phone/inbox/new?err=${mapResolveError(resolved.error)}`);
  }

  const { e164, contact } = resolved;

  /**
   * Same as inbound SMS (`applyInboundTwilioSms`): omit `leadStatusOnCreate` so `lead_status` uses the
   * column default (`new_lead`). Do not use `unclassified` here — DBs that have not applied migration
   * `20260330160000_conversations_lead_status_unclassified.sql` reject that value on insert.
   */
  const ensured = await ensureSmsConversationForPhone(supabaseAdmin, e164, contact);

  if (!ensured.ok) {
    console.error("[workspace-new-sms] step=ensure_thread FAILED (before Twilio)", {
      ensureError: ensured.error,
      e164,
    });
    redirect(
      `/workspace/phone/inbox/new?err=sms_thread&threadErr=${encodeURIComponent(ensured.error.slice(0, 500))}`
    );
  }

  const conversationId = ensured.conversationId;

  const manualFromRaw = String(formData.get("smsManualFromE164") ?? "").trim();
  logSmsDebug("[sms-send] backend_received_from", {
    smsManualFromE164: manualFromRaw || null,
    path: "workspace_new_sms",
  });
  const manualResolved = resolveManualInboxSmsFromOverride(manualFromRaw);
  if (manualFromRaw && manualResolved.source !== "explicit") {
    logSmsDebug("[sms-send] manual_from_rejected", {
      smsManualFromE164: manualFromRaw,
      reason: manualResolved.source,
    });
  }

  const fromOverride = manualResolved.source === "explicit" ? manualResolved.fromOverride : undefined;
  const persistPreferredE164 = manualResolved.source === "explicit" ? manualResolved.fromOverride : undefined;

  const sent = await sendSms({
    to: e164,
    body,
    ...(fromOverride ? { fromOverride } : {}),
    logManualInboxSend: true,
  });

  if (!sent.ok) {
    console.error("[workspace-new-sms] step=twilio_send FAILED (after conversation row)", {
      conversationId,
      error: sent.error,
    });
    const errShort = sent.error.slice(0, 600);
    redirect(`/workspace/phone/inbox/new?smsErr=${encodeURIComponent(errShort)}`);
  }

  const now = new Date().toISOString();

  const { error: insErr } = await supabaseAdmin.from("messages").insert({
    conversation_id: conversationId,
    direction: "outbound",
    body,
    external_message_sid: sent.messageSid,
    metadata: { sent_by_user_id: staff.user_id, source: "workspace_new_sms" },
  });

  if (insErr) {
    console.warn("[workspace-new-sms] message insert:", insErr.message);
    redirect(
      `/workspace/phone/inbox/new?smsErr=${encodeURIComponent(insErr.message.slice(0, 400))}`
    );
  }

  const { data: convBefore } = await supabaseAdmin
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();

  const meta: Record<string, unknown> =
    convBefore?.metadata != null && typeof convBefore.metadata === "object" && !Array.isArray(convBefore.metadata)
      ? { ...(convBefore.metadata as Record<string, unknown>) }
      : {};

  const { telemetry, deleteSuggestion } = mergeTelemetryOnSend(meta, body);
  const nextMeta: Record<string, unknown> = { ...meta, sms_suggestion_telemetry: telemetry };
  if (deleteSuggestion) {
    delete nextMeta.sms_reply_suggestion;
  }

  const { error: touchErr } = await supabaseAdmin
    .from("conversations")
    .update({
      last_message_at: now,
      updated_at: now,
      metadata: nextMeta,
      ...(persistPreferredE164 ? { preferred_from_e164: persistPreferredE164 } : {}),
    })
    .eq("id", conversationId);

  if (touchErr) {
    console.warn("[workspace-new-sms] touch conversation:", touchErr.message);
  }

  revalidateSmsViews(conversationId);
  redirect(`/workspace/phone/inbox/${conversationId}?ok=sms_sent`);
}

function mapResolveError(
  code: "bad_phone" | "contact_no_phone" | "recruit_no_phone" | "contact_not_found" | "contact_create_failed"
): string {
  switch (code) {
    case "bad_phone":
      return "sms_bad_phone";
    case "contact_no_phone":
      return "sms_contact_no_phone";
    case "recruit_no_phone":
      return "sms_recruit_no_phone";
    case "contact_not_found":
      return "sms_contact_missing";
    case "contact_create_failed":
      return "sms_contact_create";
    default:
      return "sms_resolve";
  }
}
