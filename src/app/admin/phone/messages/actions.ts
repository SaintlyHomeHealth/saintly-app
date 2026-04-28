"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { normalizeCrmContactType } from "@/lib/crm/contact-types";
import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { logSmsMessageForLeadTimeline } from "@/lib/crm/lead-communication-activity";
import { UNKNOWN_TEXTER_METADATA_KEY } from "@/lib/phone/sms-conversation-thread";
import { buildInitialTwilioDeliveryFromRestResponse } from "@/lib/phone/sms-delivery-ui";
import { mergeTelemetryOnSend, mergeTelemetryOnShown } from "@/lib/phone/sms-suggestion-telemetry";
import {
  canStaffAccessConversationRow,
  canStaffClaimConversation,
} from "@/lib/phone/staff-conversation-access";
import {
  loadContactForZapierByConversation,
  notifyZapierLeadStatus,
} from "@/lib/integrations/zapier-lead-status-webhook";
import { parseLeadStatus } from "@/lib/phone/lead-status";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { markInboundMessagesViewedForConversation } from "@/lib/phone/sms-inbound-unread";
import {
  allowlistedOutboundE164OrUndefined,
  resolveManualInboxSmsFromOverride,
} from "@/lib/twilio/manual-inbox-sms-from";
import { logSmsDebug } from "@/lib/twilio/sms-debug";
import { sendSms } from "@/lib/twilio/send-sms";
import {
  isSaintlyBackupSmsE164,
  resolveDefaultTwilioSmsFromOrMsid,
  SMS_OUTBOUND_FROM_EXPLICIT_KEY,
  shouldHonorThreadPreferredFromE164,
} from "@/lib/twilio/sms-from-numbers";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  hasFullCallVisibility,
  isAdminOrHigher,
  type StaffProfile,
} from "@/lib/staff-profile";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const INTAKE_NAME_MAX = 500;
const SMS_THREAD_CONTACT_NOTES_MAX = 8000;
const SMS_BODY_MAX = 1600;

function parseIntakeContactType(raw: unknown): "patient" | "family" | "referral" | null {
  const s = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (s === "patient" || s === "family" || s === "referral") return s;
  return null;
}

/**
 * Same gate as `/workspace/phone` and `/admin/phone/messages` UI: nurses may message without
 * `phone_access_enabled`; managers/admins/super_admins still require that flag.
 */
function requirePhoneMessagingStaff(staff: StaffProfile | null): staff is StaffProfile {
  if (!staff || !canAccessWorkspacePhone(staff)) return false;
  return true;
}

function revalidateSmsConversationViews(conversationId: string) {
  revalidatePath("/admin/phone/messages");
  revalidatePath(`/admin/phone/messages/${conversationId}`);
  revalidatePath("/workspace/phone/inbox");
  revalidatePath(`/workspace/phone/inbox/${conversationId}`);
}

type ConversationAccessRow = {
  id: string;
  assigned_to_user_id: string | null;
  primary_contact_id: string | null;
  main_phone_e164: string | null;
  lead_status: string | null;
  preferred_from_e164: string | null;
  metadata: unknown;
};

export type MessagingActionResult = { ok: true } | { ok: false; error: string };

async function loadConversationForAccess(
  conversationId: string
): Promise<{ row: ConversationAccessRow | null }> {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("id, assigned_to_user_id, primary_contact_id, main_phone_e164, lead_status, preferred_from_e164, metadata")
    .eq("id", conversationId)
    .eq("channel", "sms")
    .maybeSingle();

  if (error || !data?.id) {
    return { row: null };
  }

  return {
    row: {
      id: String(data.id),
      assigned_to_user_id:
        data.assigned_to_user_id != null && String(data.assigned_to_user_id).trim() !== ""
          ? String(data.assigned_to_user_id)
          : null,
      primary_contact_id:
        data.primary_contact_id != null && String(data.primary_contact_id).trim() !== ""
          ? String(data.primary_contact_id)
          : null,
      main_phone_e164: typeof data.main_phone_e164 === "string" ? data.main_phone_e164 : null,
      lead_status: typeof data.lead_status === "string" ? data.lead_status : null,
      preferred_from_e164:
        data.preferred_from_e164 != null && String(data.preferred_from_e164).trim() !== ""
          ? String(data.preferred_from_e164).trim()
          : null,
      metadata: data.metadata,
    },
  };
}

/** Marks inbound SMS as read for staff; revalidates inbox when any rows were updated. */
export async function markSmsThreadInboundViewed(conversationId: string): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) return { ok: false, error: "You do not have access." };
  if (!conversationId || !UUID_RE.test(conversationId)) return { ok: false, error: "Invalid conversation." };

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) return { ok: false, error: "Conversation not found." };
  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return { ok: false, error: "You do not have access to this conversation." };
  }

  const marked = await markInboundMessagesViewedForConversation(conversationId);
  if (marked > 0) {
    revalidateSmsConversationViews(conversationId);
  }
  return { ok: true };
}

/** Debug: clear viewed_at on the latest inbound message only (service role). */
export async function markLatestInboundUnreadForDebug(conversationId: string): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) return { ok: false, error: "You do not have access." };
  if (!conversationId || !UUID_RE.test(conversationId)) return { ok: false, error: "Invalid conversation." };

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) return { ok: false, error: "Conversation not found." };
  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return { ok: false, error: "You do not have access to this conversation." };
  }

  const { data: latest, error: selErr } = await supabaseAdmin
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (selErr) {
    console.warn("[sms-debug] markLatestInboundUnreadForDebug select:", selErr.message);
    return { ok: false, error: "Could not load latest inbound message." };
  }
  if (!latest?.id) return { ok: true };

  const { error: upErr } = await supabaseAdmin
    .from("messages")
    .update({ viewed_at: null })
    .eq("id", latest.id)
    .eq("direction", "inbound");

  if (upErr) {
    console.warn("[sms-debug] markLatestInboundUnreadForDebug update:", upErr.message);
    return { ok: false, error: "Could not mark message unread." };
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}

export async function claimConversation(formData: FormData): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const raw = formData.get("conversationId");
  const conversationId = typeof raw === "string" ? raw.trim() : "";
  if (!conversationId || !UUID_RE.test(conversationId)) {
    return { ok: false, error: "Invalid conversation." };
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    console.warn("[messages] claimConversation: not found", { conversationId });
    return { ok: false, error: "Conversation not found." };
  }

  if (!canStaffClaimConversation(staff, { assigned_to_user_id: row.assigned_to_user_id })) {
    return { ok: false, error: "You cannot claim this conversation." };
  }

  const now = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("conversations")
    .update({
      assigned_to_user_id: staff.user_id,
      assigned_at: now,
    })
    .eq("id", conversationId)
    .is("assigned_to_user_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[messages] claimConversation:", error.message);
    return { ok: false, error: error.message || "Could not claim conversation." };
  }
  if (!data?.id) {
    console.warn("[messages] claimConversation: already assigned", { conversationId });
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}

export async function assignConversation(formData: FormData): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff) || !hasFullCallVisibility(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const convRaw = formData.get("conversationId");
  const userRaw = formData.get("assignToUserId");
  const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";
  const assignToUserId = typeof userRaw === "string" ? userRaw.trim() : "";
  if (!conversationId || !assignToUserId || !UUID_RE.test(assignToUserId)) {
    return { ok: false, error: "Invalid assignment." };
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return { ok: false, error: "Conversation not found." };
  }

  const { data: target, error: tErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, full_name, is_active")
    .eq("user_id", assignToUserId)
    .maybeSingle();

  if (tErr || !target?.user_id || target.is_active === false) {
    console.warn("[messages] assignConversation target:", tErr?.message);
    return { ok: false, error: "Could not find an active staff member to assign." };
  }

  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({
      assigned_to_user_id: assignToUserId,
      assigned_at: now,
    })
    .eq("id", conversationId);

  if (error) {
    console.warn("[messages] assignConversation:", error.message);
    return { ok: false, error: error.message || "Could not assign conversation." };
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}

export async function unassignConversation(formData: FormData): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff) || !isAdminOrHigher(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const raw = formData.get("conversationId");
  const conversationId = typeof raw === "string" ? raw.trim() : "";
  if (!conversationId) {
    return { ok: false, error: "Invalid conversation." };
  }

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({
      assigned_to_user_id: null,
      assigned_at: null,
    })
    .eq("id", conversationId);

  if (error) {
    console.warn("[messages] unassignConversation:", error.message);
    return { ok: false, error: error.message || "Could not unassign conversation." };
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}

export async function updateConversationLeadStatus(formData: FormData): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const convRaw = formData.get("conversationId");
  const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";
  const statusRaw = formData.get("leadStatus");
  const leadStatus = parseLeadStatus(statusRaw);

  if (!conversationId || !UUID_RE.test(conversationId) || !leadStatus) {
    return { ok: false, error: "Invalid lead status." };
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return { ok: false, error: "Conversation not found." };
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return { ok: false, error: "You do not have access to this conversation." };
  }

  const prevStatus = typeof row.lead_status === "string" ? row.lead_status.trim() : "";

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({ lead_status: leadStatus })
    .eq("id", conversationId);

  if (error) {
    console.warn("[messages] updateConversationLeadStatus:", error.message);
    return { ok: false, error: error.message || "Could not update lead status." };
  }

  const zapierStatuses = new Set(["spoke", "scheduled", "admitted"]);
  if (zapierStatuses.has(leadStatus) && prevStatus !== leadStatus) {
    const contact = await loadContactForZapierByConversation(row.primary_contact_id, row.main_phone_e164);
    const statusForZapier =
      leadStatus === "spoke" ? "spoke" : leadStatus === "scheduled" ? "scheduled" : "admitted";
    notifyZapierLeadStatus({
      email: contact.email,
      phone: contact.phone,
      status: statusForZapier,
      name: contact.name,
    });
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}

const NEXT_ACTION_MAX = 500;

function datetimeLocalToIso(dueRaw: string | null | undefined): string | null {
  if (!dueRaw) return null;
  const trimmed = String(dueRaw).trim();
  if (!trimmed) return null;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export async function updateConversationFollowUp(formData: FormData): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const convRaw = formData.get("conversationId");
  const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";
  const nextActionRaw = formData.get("nextAction");
  const dueRaw = formData.get("dueAt");

  const nextAction =
    typeof nextActionRaw === "string" ? nextActionRaw.trim().slice(0, NEXT_ACTION_MAX) : "";
  const dueIso = datetimeLocalToIso(typeof dueRaw === "string" ? dueRaw : null);

  if (!conversationId || !UUID_RE.test(conversationId)) {
    return { ok: false, error: "Invalid conversation." };
  }
  if (!nextAction && !dueIso) {
    return { ok: false, error: "Add a next action or due date." };
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return { ok: false, error: "Conversation not found." };
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return { ok: false, error: "You do not have access to this conversation." };
  }

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({
      next_action: nextAction ? nextAction : null,
      follow_up_due_at: dueIso,
      follow_up_completed_at: null,
    })
    .eq("id", conversationId);

  if (error) {
    console.warn("[messages] updateConversationFollowUp:", error.message);
    return { ok: false, error: error.message || "Could not update follow-up." };
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}

export async function completeConversationFollowUp(formData: FormData): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const convRaw = formData.get("conversationId");
  const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";

  if (!conversationId || !UUID_RE.test(conversationId)) {
    return { ok: false, error: "Invalid conversation." };
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return { ok: false, error: "Conversation not found." };
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return { ok: false, error: "You do not have access to this conversation." };
  }

  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({ follow_up_completed_at: now })
    .eq("id", conversationId)
    .is("follow_up_completed_at", null);

  if (error) {
    console.warn("[messages] completeConversationFollowUp:", error.message);
    return { ok: false, error: error.message || "Could not complete follow-up." };
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}

export async function clearConversationFollowUp(formData: FormData): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const convRaw = formData.get("conversationId");
  const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";

  if (!conversationId || !UUID_RE.test(conversationId)) {
    return { ok: false, error: "Invalid conversation." };
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return { ok: false, error: "Conversation not found." };
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return { ok: false, error: "You do not have access to this conversation." };
  }

  const { error } = await supabaseAdmin
    .from("conversations")
    .update({
      next_action: null,
      follow_up_due_at: null,
      follow_up_completed_at: null,
    })
    .eq("id", conversationId)
    .is("follow_up_completed_at", null);

  if (error) {
    console.warn("[messages] clearConversationFollowUp:", error.message);
    return { ok: false, error: error.message || "Could not clear follow-up." };
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}

/** Messaging mutations return a consistent result shape for every UI context. */
export type SendConversationSmsResult = MessagingActionResult;

export async function sendConversationSms(formData: FormData): Promise<SendConversationSmsResult> {
  const staff = await getStaffProfile();
  const returnToRaw = String(formData.get("returnTo") ?? "").trim();
  const workspaceAny = returnToRaw === "workspace" || returnToRaw === "workspace_inbox";

  const idRaw = formData.get("conversationId");
  const bodyRaw = formData.get("body");
  const conversationId = typeof idRaw === "string" ? idRaw.trim() : "";
  const body = typeof bodyRaw === "string" ? bodyRaw.trim().slice(0, SMS_BODY_MAX) : "";

  if (!requirePhoneMessagingStaff(staff)) {
    console.warn("[sms-send] blocked: staff cannot access workspace phone", {
      hasStaff: Boolean(staff),
      returnToRaw,
    });
    return { ok: false, error: "You do not have access to send messages." };
  }

  logSmsDebug("[sms-ui] send submit", {
    conversationId,
    bodyLen: body.length,
    returnToRaw,
  });

  if (!conversationId || !UUID_RE.test(conversationId) || !body) {
    console.warn("[sms-send] invalid conversation or empty body");
    return { ok: false, error: "Enter a message and try again." };
  }

  const { row } = await loadConversationForAccess(conversationId);
  const rawRecipient = row?.main_phone_e164 != null ? String(row.main_phone_e164).trim() : "";
  const normalizedRecipient =
    normalizeDialInputToE164(rawRecipient) ?? (isValidE164(rawRecipient) ? rawRecipient : "");
  const to = normalizedRecipient;

  logSmsDebug("[sms-send] resolved recipient", {
    conversationId,
    rawRecipient,
    normalizedRecipient: to,
    conversationExists: Boolean(row?.id),
  });

  if (!row?.main_phone_e164) {
    console.warn("[sms-db] sendConversationSms: missing row or phone", { conversationId });
    return { ok: false, error: "No phone number on file for this conversation." };
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    console.warn("[sms-send] forbidden: conversation row", { conversationId });
    return { ok: false, error: "You do not have access to this conversation." };
  }

  if (!to || !isValidE164(to)) {
    console.warn("[sms-send] bad E.164 after normalize", { rawRecipient, to });
    return { ok: false, error: "Phone number is invalid or missing." };
  }

  const manualFromRaw = String(formData.get("smsManualFromE164") ?? "").trim();
  logSmsDebug("[sms-send] backend_received_from", {
    smsManualFromE164: manualFromRaw || null,
    returnToRaw,
  });
  const manualResolved = resolveManualInboxSmsFromOverride(manualFromRaw);
  if (manualFromRaw && manualResolved.source !== "explicit") {
    logSmsDebug("[sms-send] manual_from_rejected", {
      smsManualFromE164: manualFromRaw,
      reason: manualResolved.source,
    });
  }

  let fromOverride: string | undefined;
  /** When set, persist to `conversations.preferred_from_e164` after a successful send. */
  let persistPreferredE164: string | undefined;

  if (manualResolved.source === "explicit") {
    fromOverride = manualResolved.fromOverride;
    persistPreferredE164 = manualResolved.fromOverride;
  } else {
    const pref = allowlistedOutboundE164OrUndefined(row.preferred_from_e164);
    if (row.preferred_from_e164 && !pref) {
      logSmsDebug("[sms-send] preferred_from_ignored", {
        preferred_from_e164: row.preferred_from_e164,
      });
    }
    if (pref && shouldHonorThreadPreferredFromE164(pref, row.metadata)) {
      fromOverride = pref;
    }
  }

  logSmsDebug("[sms-twilio] send start", { conversationId, to, bodyLen: body.length });
  const sent = await sendSms({
    to,
    body,
    ...(fromOverride ? { fromOverride } : {}),
    logManualInboxSend: workspaceAny,
  });
  if (!sent.ok) {
    const errShort = sent.error.slice(0, 400);
    console.warn("[sms-twilio] send failed", errShort);
    return {
      ok: false,
      error: errShort ? `SMS could not be sent: ${errShort}` : "SMS could not be sent. Try again.",
    };
  }
  logSmsDebug("[sms-twilio] send ok", { conversationId, messageSid: sent.messageSid });

  const now = new Date().toISOString();
  const resolvedFrom = (fromOverride ?? "").trim() || resolveDefaultTwilioSmsFromOrMsid();
  const fromE164ForLog = resolvedFrom.startsWith("MG") ? null : resolvedFrom;

  const { data: insertedMsg, error: insErr } = await supabaseAdmin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direction: "outbound",
      body,
      external_message_sid: sent.messageSid,
      metadata: {
        sent_by_user_id: staff.user_id,
        twilio_delivery: buildInitialTwilioDeliveryFromRestResponse({
          twilioStatus: sent.twilioStatus ?? null,
          updatedAtIso: now,
          fromE164: fromE164ForLog,
          toE164: to,
        }),
      },
    })
    .select("id")
    .single();

  if (insErr) {
    console.warn("[sms-db] outbound insert failed", insErr.message);
    const dbMsg = insErr.message.slice(0, 400);
    return {
      ok: false,
      error: dbMsg ? `Message could not be saved: ${dbMsg}` : "Message could not be saved.",
    };
  }
  console.log("[sms-db] outbound insert ok", { conversationId });

  if (insertedMsg?.id) {
    void logSmsMessageForLeadTimeline({
      direction: "outbound",
      contactId: row.primary_contact_id,
      partyPhoneE164: to,
      conversationId,
      messageId: String(insertedMsg.id),
      body,
      createdByUserId: staff.user_id,
    });
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
  if (manualResolved.source === "explicit" && persistPreferredE164) {
    nextMeta[SMS_OUTBOUND_FROM_EXPLICIT_KEY] = isSaintlyBackupSmsE164(persistPreferredE164);
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
    console.warn("[sms-db] conversation touch after send:", touchErr.message);
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}

/** Fire once when the thread UI shows an AI suggestion (idempotent per for_message_id). */
export async function recordSmsSuggestionShown(
  conversationId: string,
  forMessageId: string
): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  if (!conversationId || !UUID_RE.test(conversationId) || !forMessageId || !UUID_RE.test(forMessageId)) {
    return { ok: false, error: "Invalid suggestion." };
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return { ok: false, error: "Conversation not found." };
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return { ok: false, error: "You do not have access to this conversation." };
  }

  const { data: convRow, error: selErr } = await supabaseAdmin
    .from("conversations")
    .select("metadata")
    .eq("id", conversationId)
    .maybeSingle();

  if (selErr) {
    console.warn("[messages] recordSmsSuggestionShown select:", selErr.message);
    return { ok: false, error: "Could not load SMS suggestion." };
  }

  const meta: Record<string, unknown> =
    convRow?.metadata != null && typeof convRow.metadata === "object" && !Array.isArray(convRow.metadata)
      ? { ...(convRow.metadata as Record<string, unknown>) }
      : {};

  const nextTel = mergeTelemetryOnShown(meta, forMessageId);
  if (!nextTel) {
    return { ok: true };
  }

  const { error: upErr } = await supabaseAdmin
    .from("conversations")
    .update({ metadata: { ...meta, sms_suggestion_telemetry: nextTel } })
    .eq("id", conversationId);

  if (upErr) {
    console.warn("[messages] recordSmsSuggestionShown update:", upErr.message);
    return { ok: false, error: "Could not record SMS suggestion telemetry." };
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}

export async function createContactIntakeFromConversation(
  formData: FormData
): Promise<MessagingActionResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const convId = String(formData.get("conversationId") ?? "").trim();
  const firstName = String(formData.get("firstName") ?? "").trim().slice(0, INTAKE_NAME_MAX);
  const lastName = String(formData.get("lastName") ?? "").trim().slice(0, INTAKE_NAME_MAX);
  const fullNameInput = String(formData.get("fullName") ?? "").trim().slice(0, INTAKE_NAME_MAX);
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const intakeType = parseIntakeContactType(formData.get("intakeType"));
  const email = String(formData.get("email") ?? "").trim();
  const addressLine1 = String(formData.get("addressLine1") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const stateVal = String(formData.get("state") ?? "").trim();
  const zip = String(formData.get("zip") ?? "").trim();
  const referralSource = String(formData.get("referralSource") ?? "").trim();
  const notes = String(formData.get("notes") ?? "").trim();

  if (!convId || !UUID_RE.test(convId)) {
    return { ok: false, error: "Invalid conversation." };
  }
  if (!intakeType) {
    return { ok: false, error: "Choose a contact type." };
  }

  if (!fullNameInput && !firstName) {
    return { ok: false, error: "Name is required." };
  }

  const derivedFullName =
    fullNameInput || [firstName, lastName].filter(Boolean).join(" ").trim();

  const phoneE164 = normalizeDialInputToE164(phoneRaw);
  if (!phoneE164 || !isValidE164(phoneE164)) {
    return { ok: false, error: "Phone number is invalid or missing." };
  }
  if (!derivedFullName) {
    return { ok: false, error: "Name is required." };
  }

  const { row } = await loadConversationForAccess(convId);
  if (!row) {
    return { ok: false, error: "Conversation not found." };
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row!.assigned_to_user_id,
    })
  ) {
    return { ok: false, error: "You do not have access to this conversation." };
  }

  if (row!.primary_contact_id) {
    return { ok: false, error: "This conversation already has a contact." };
  }

  const byPhone = await findContactByIncomingPhone(supabaseAdmin, phoneE164);
  let contactId: string;

  const contactPatch: Record<string, unknown> = {
    full_name: derivedFullName,
    primary_phone: phoneE164,
    contact_type: intakeType,
  };

  if (firstName) contactPatch.first_name = firstName;
  if (lastName) contactPatch.last_name = lastName;
  if (email) contactPatch.email = email;
  if (addressLine1) contactPatch.address_line_1 = addressLine1;
  if (city) contactPatch.city = city;
  if (stateVal) contactPatch.state = stateVal;
  if (zip) contactPatch.zip = zip;
  if (referralSource) contactPatch.referral_source = referralSource;
  if (notes) contactPatch.notes = notes;

  if (byPhone?.id) {
    contactId = byPhone.id;
    const { error: upErr } = await supabaseAdmin
      .from("contacts")
      .update(contactPatch)
      .eq("id", contactId);

    if (upErr) {
      console.warn("[messages] intake update contact:", upErr.message);
      return { ok: false, error: upErr.message || "Could not update contact." };
    }
  } else {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("contacts")
      .insert(contactPatch)
      .select("id")
      .single();

    const newId = inserted?.id;
    if (insErr || !newId) {
      console.warn("[messages] intake insert:", insErr?.message);
      return { ok: false, error: insErr?.message || "Could not create contact." };
    }
    contactId = String(newId);
  }

  const { data: convMetaRow } = await supabaseAdmin
    .from("conversations")
    .select("metadata")
    .eq("id", convId)
    .maybeSingle();

  const prevMeta =
    convMetaRow?.metadata &&
    typeof convMetaRow.metadata === "object" &&
    !Array.isArray(convMetaRow.metadata)
      ? ({ ...convMetaRow.metadata } as Record<string, unknown>)
      : {};
  delete prevMeta[UNKNOWN_TEXTER_METADATA_KEY];
  delete prevMeta.auto_intake_at;

  const { error: linkErr } = await supabaseAdmin
    .from("conversations")
    .update({
      primary_contact_id: contactId,
      metadata: prevMeta,
      updated_at: new Date().toISOString(),
    })
    .eq("id", convId)
    .is("primary_contact_id", null);

  if (linkErr) {
    console.warn("[messages] intake link:", linkErr.message);
    return { ok: false, error: linkErr.message || "Could not link contact to thread." };
  }

  revalidateSmsConversationViews(convId);
  return { ok: true };
}

export type SaveSmsThreadContactResult = MessagingActionResult;

/**
 * Create or update the CRM contact for the current SMS thread (workspace quick editor).
 * Returns JSON so the client can refresh the thread header without a full redirect.
 */
export async function saveSmsThreadContact(formData: FormData): Promise<SaveSmsThreadContactResult> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return { ok: false, error: "You do not have access." };
  }

  const conversationId = String(formData.get("conversationId") ?? "").trim();
  const fullNameRaw = String(formData.get("fullName") ?? "").trim().slice(0, INTAKE_NAME_MAX);
  const email = String(formData.get("email") ?? "").trim().slice(0, 500);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, SMS_THREAD_CONTACT_NOTES_MAX);
  const tags = String(formData.get("tags") ?? "").trim().slice(0, 500);
  const contactTypeRaw = String(formData.get("contactType") ?? "").trim().toLowerCase();
  const normalizedType = normalizeCrmContactType(contactTypeRaw) ?? "other";

  if (!conversationId || !UUID_RE.test(conversationId)) {
    return { ok: false, error: "Invalid conversation." };
  }
  if (!fullNameRaw) {
    return { ok: false, error: "Name is required." };
  }

  const { row } = await loadConversationForAccess(conversationId);
  if (!row) {
    return { ok: false, error: "Conversation not found." };
  }

  if (
    !canStaffAccessConversationRow(staff, {
      assigned_to_user_id: row.assigned_to_user_id,
    })
  ) {
    return { ok: false, error: "You do not have access to this thread." };
  }

  const phoneE164 =
    typeof row.main_phone_e164 === "string" && row.main_phone_e164.trim()
      ? row.main_phone_e164.trim()
      : "";
  if (!phoneE164 || !isValidE164(phoneE164)) {
    return { ok: false, error: "This thread has no valid phone number." };
  }

  const notesCombined =
    tags && notes
      ? `${notes}\n\nTags: ${tags}`
      : tags
        ? `Tags: ${tags}`
        : notes;

  const contactPatch: Record<string, unknown> = {
    full_name: fullNameRaw,
    contact_type: normalizedType,
    primary_phone: phoneE164,
    updated_at: new Date().toISOString(),
  };
  if (email) contactPatch.email = email;
  contactPatch.notes = notesCombined ? notesCombined : null;

  let contactId: string;

  if (row.primary_contact_id && String(row.primary_contact_id).trim()) {
    contactId = String(row.primary_contact_id).trim();
    const { error: upErr } = await supabaseAdmin.from("contacts").update(contactPatch).eq("id", contactId);
    if (upErr) {
      console.warn("[messages] saveSmsThreadContact update:", upErr.message);
      return { ok: false, error: upErr.message || "Could not update contact." };
    }
  } else {
    const byPhone = await findContactByIncomingPhone(supabaseAdmin, phoneE164);
    if (byPhone?.id) {
      contactId = byPhone.id;
      const { error: upErr } = await supabaseAdmin.from("contacts").update(contactPatch).eq("id", contactId);
      if (upErr) {
        console.warn("[messages] saveSmsThreadContact upsert by phone:", upErr.message);
        return { ok: false, error: upErr.message || "Could not save contact." };
      }
    } else {
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("contacts")
        .insert(contactPatch)
        .select("id")
        .single();
      const newId = inserted?.id;
      if (insErr || !newId) {
        console.warn("[messages] saveSmsThreadContact insert:", insErr?.message);
        return { ok: false, error: insErr?.message || "Could not create contact." };
      }
      contactId = String(newId);
    }

    const { data: convMetaRow } = await supabaseAdmin
      .from("conversations")
      .select("metadata")
      .eq("id", conversationId)
      .maybeSingle();

    const prevMeta =
      convMetaRow?.metadata &&
      typeof convMetaRow.metadata === "object" &&
      !Array.isArray(convMetaRow.metadata)
        ? ({ ...convMetaRow.metadata } as Record<string, unknown>)
        : {};
    delete prevMeta[UNKNOWN_TEXTER_METADATA_KEY];
    delete prevMeta.auto_intake_at;

    const { error: linkErr } = await supabaseAdmin
      .from("conversations")
      .update({
        primary_contact_id: contactId,
        main_phone_e164: phoneE164,
        metadata: prevMeta,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId);

    if (linkErr) {
      console.warn("[messages] saveSmsThreadContact link:", linkErr.message);
      return { ok: false, error: linkErr.message || "Could not link contact to thread." };
    }
  }

  revalidateSmsConversationViews(conversationId);
  return { ok: true };
}
