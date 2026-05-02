import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { WorkspaceSmsThreadViewLazy } from "./sms-conversation-lazy-client";
import {
  assignConversation,
  claimConversation,
  createContactIntakeFromConversation,
  unassignConversation,
  updateConversationLeadStatus,
  clearConversationFollowUp,
  completeConversationFollowUp,
  updateConversationFollowUp,
} from "../actions";
import { SmsReplyComposer } from "./SmsReplyComposer";
import { SmsThreadMarkReadOnViewClient } from "./SmsThreadMarkReadOnViewClient";
import { SmsThreadDebugStrip } from "./SmsThreadDebugStrip";
import { WorkspaceSmsConversationShell } from "@/app/workspace/phone/inbox/_components/workspace-sms-conversation-shell";
import { SmsMessageMediaAttachments } from "@/app/workspace/phone/inbox/_components/SmsMessageMediaAttachments";
import { VoicemailThreadMessageRow } from "@/app/workspace/phone/inbox/_components/VoicemailThreadMessageRow";
import { WorkspaceSmsDeleteConversationButton } from "@/app/workspace/phone/inbox/_components/WorkspaceSmsDeleteConversationButton";
import { supabaseAdmin } from "@/lib/admin";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { labelForContactType } from "@/lib/crm/contact-types";
import { ADMIN_PHONE_DISPLAY_TIMEZONE, formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { normalizeConversationLeadStatusForInsert } from "@/lib/phone/conversation-lead-status";
import { extractSmsProviderStatusRaw, formatSmsOutboundDeliveryLabel } from "@/lib/phone/sms-delivery-ui";
import {
  readWorkspaceSmsThreadFax,
  WORKSPACE_SMS_THREAD_INITIAL_MESSAGE_LIMIT,
} from "@/lib/phone/workspace-sms-thread-messages";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { resolvePhoneDisplayIdentity } from "@/lib/phone/resolve-phone-display-identity";
import {
  routePerfLog,
  routePerfStart,
  routePerfStepsEnabled,
  routePerfTimed,
} from "@/lib/perf/route-perf";
import { staffMayAccessSmsConversation } from "@/lib/phone/staff-sms-conversation-access-async";
import { staffMayAccessWorkspaceSms } from "@/lib/phone/staff-phone-policy";
import {
  canStaffClaimConversation,
} from "@/lib/phone/staff-conversation-access";
import {
  canAccessWorkspacePhone,
  getStaffProfile,
  hasFullCallVisibility,
  isAdminOrHigher,
  isWorkspaceEmployeeRole,
} from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidE164 } from "@/lib/softphone/phone-number";
import { buildWorkspaceKeypadCallHref } from "@/lib/workspace-phone/launch-urls";
import { smsReplyAiSuggestionsEnabled } from "@/lib/phone/sms-ai-suggestions-flag";
import { SMS_OUTBOUND_FROM_EXPLICIT_KEY } from "@/lib/twilio/sms-from-numbers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

import { mapNestedPhoneAttachmentsFromRpcRow as mapSupabaseNestedPhoneAttachments } from "@/lib/phone/map-phone-message-attachments-row";
export type SmsConversationDetailProps = {
  params: Promise<{ conversationId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  /** Back link target (admin inbox vs staff workspace inbox). */
  inboxHref: string;
  /** Where to send users who fail the phone gate (matches existing admin behavior when omitted). */
  accessDeniedHref?: string;
  /** Extra bottom padding when rendered inside a fixed bottom nav shell. */
  workspaceShell?: boolean;
  /** Desktop inbox split: CRM in right column; thread list stays on `/workspace/phone/inbox`. */
  workspaceDesktopSplit?: boolean;
};

function intakeErrLabel(code: string | undefined): string | null {
  if (!code) return null;
  switch (code) {
    case "intake":
      return "Could not save contact / intake. Check fields and try again.";
    case "intake_phone":
      return "Enter a valid phone number (10 digits or +1… E.164).";
    case "intake_forbidden":
      return "You do not have access to add intake for this thread.";
    case "intake_exists":
      return "A contact is already linked.";
    default:
      return null;
  }
}

function smsSendErrLabel(code: string | undefined, smsErrRaw: string | undefined): string | null {
  if (!code || !code.startsWith("sms_")) return null;
  switch (code) {
    case "sms_twilio":
      return smsErrRaw
        ? `SMS could not be sent: ${smsErrRaw}`
        : "SMS could not be sent. Check Twilio configuration or server logs.";
    case "sms_db":
      return smsErrRaw
        ? `SMS may have been delivered but failed to save: ${smsErrRaw}`
        : "SMS may have been delivered but failed to save in the inbox.";
    case "sms_no_phone":
      return "This thread has no phone number on file.";
    case "sms_bad_phone":
      return "The phone number on this thread is invalid. Update the contact or thread phone.";
    case "sms_forbidden":
      return "You do not have permission to send on this thread.";
    case "sms_invalid":
      return "Could not send SMS (empty message or invalid thread).";
    default:
      return null;
  }
}

function parseSmsReplySuggestion(
  meta: unknown
): { text: string; for_message_id: string; generated_at: string } | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const s = (meta as Record<string, unknown>).sms_reply_suggestion;
  if (!s || typeof s !== "object" || Array.isArray(s)) return null;
  const o = s as Record<string, unknown>;
  const text = typeof o.text === "string" ? o.text.trim() : "";
  const mid = typeof o.for_message_id === "string" ? o.for_message_id.trim() : "";
  const generatedAt = typeof o.generated_at === "string" ? o.generated_at.trim() : "";
  if (!text || !mid || !generatedAt) return null;
  return { text, for_message_id: mid, generated_at: generatedAt };
}

function isoToDatetimeLocalValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_PHONE_DISPLAY_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (type: Intl.DateTimeFormatPart["type"]) =>
    parts.find((p) => p.type === type)?.value ?? "";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

export async function SmsConversationDetail(props: SmsConversationDetailProps) {
  const perfStart = routePerfStart();
  const {
    params,
    searchParams,
    inboxHref,
    accessDeniedHref = "/admin/phone",
    workspaceShell,
    workspaceDesktopSplit = false,
  } = props;

  const staff = routePerfStepsEnabled()
    ? await routePerfTimed("sms_conversation_detail.staff_profile", getStaffProfile)
    : await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff) || !staffMayAccessWorkspaceSms(staff)) {
    redirect(accessDeniedHref);
  }

  const { conversationId } = await params;
  if (!conversationId || !UUID_RE.test(conversationId)) {
    notFound();
  }

  /** SMS composer draft only; see `ENABLE_SMS_AI_SUGGESTIONS` and `SMS_AI_SUGGESTIONS_DISABLED`. */
  const smsAiSuggestionsEnabled = smsReplyAiSuggestionsEnabled();
  /** MMS/thread diagnostics: opt-in via SMS_THREAD_DEBUG=1 only (not implied by NODE_ENV). */
  const showSmsThreadDebug = process.env.SMS_THREAD_DEBUG === "1";

  const sp = (await searchParams) ?? {};
  const ok = typeof sp.ok === "string" ? sp.ok : undefined;
  const errCode = typeof sp.err === "string" ? sp.err : undefined;
  const smsErrRaw =
    typeof sp.smsErr === "string" ? sp.smsErr : Array.isArray(sp.smsErr) ? sp.smsErr[0] : undefined;
  const intakeErr = errCode?.startsWith("intake") ? intakeErrLabel(errCode) : null;
  const smsSendErr = smsSendErrLabel(errCode, smsErrRaw);

  const hasFull = hasFullCallVisibility(staff);
  const supabase = await createServerSupabaseClient();

  const { data: conv, error: convErr } = routePerfStepsEnabled()
    ? await routePerfTimed("sms_conversation_detail.conversation", () =>
        supabase
          .from("conversations")
          .select(
            "id, created_at, updated_at, channel, main_phone_e164, preferred_from_e164, last_message_at, lead_status, next_action, follow_up_due_at, follow_up_completed_at, assigned_to_user_id, assigned_at, primary_contact_id, metadata, deleted_at, contacts ( id, full_name, first_name, last_name, primary_phone, contact_type, email, notes )"
          )
          .eq("id", conversationId)
          .eq("channel", "sms")
          .maybeSingle()
      )
    : await supabase
        .from("conversations")
        .select(
          "id, created_at, updated_at, channel, main_phone_e164, preferred_from_e164, last_message_at, lead_status, next_action, follow_up_due_at, follow_up_completed_at, assigned_to_user_id, assigned_at, primary_contact_id, metadata, deleted_at, contacts ( id, full_name, first_name, last_name, primary_phone, contact_type, email, notes )"
        )
        .eq("id", conversationId)
        .eq("channel", "sms")
        .maybeSingle();

  if (convErr || !conv?.id) {
    console.warn("[admin/phone/messages/detail] load:", convErr?.message);
    notFound();
  }

  const convDeletedAt =
    conv.deleted_at != null && String(conv.deleted_at).trim() !== "" ? String(conv.deleted_at) : null;
  if (convDeletedAt) {
    notFound();
  }

  const assignedTo =
    conv.assigned_to_user_id != null && String(conv.assigned_to_user_id).trim() !== ""
      ? String(conv.assigned_to_user_id)
      : null;

  const mayAccess = await staffMayAccessSmsConversation(supabase, staff, conversationId, {
    assigned_to_user_id: assignedTo,
  });
  if (!mayAccess) {
    notFound();
  }

  const canClaim = canStaffClaimConversation(staff, { assigned_to_user_id: assignedTo });

  let assigneeLabel: string | null = null;
  if (assignedTo) {
    const { data: assignee } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .eq("user_id", assignedTo)
      .maybeSingle();
    if (assignee?.user_id) {
      const em = typeof assignee.email === "string" ? assignee.email.trim() : "";
      const fn = typeof assignee.full_name === "string" ? assignee.full_name.trim() : "";
      assigneeLabel = em || fn || `User ${String(assignee.user_id).slice(0, 8)}…`;
    } else {
      assigneeLabel = `${assignedTo.slice(0, 8)}…`;
    }
  }

  let assignableStaff: { user_id: string; label: string }[] = [];
  if (hasFull) {
    const { data: staffRows, error: staffErr } = await supabaseAdmin
      .from("staff_profiles")
      .select("user_id, email, full_name")
      .eq("is_active", true)
      .order("email", { ascending: true });
    if (staffErr) {
      console.warn("[admin/phone/messages] assignable staff:", staffErr.message);
    } else {
      assignableStaff = (staffRows ?? [])
        .map((r) => {
          const uid = typeof r.user_id === "string" ? r.user_id : "";
          if (!uid) return null;
          const em = typeof r.email === "string" ? r.email.trim() : "";
          const fn = typeof r.full_name === "string" ? r.full_name.trim() : "";
          const label = em || fn || `User ${uid.slice(0, 8)}…`;
          return { user_id: uid, label };
        })
        .filter((x): x is { user_id: string; label: string } => Boolean(x));
    }
  }

  const { data: msgRows, error: msgErr } = routePerfStepsEnabled()
    ? await routePerfTimed("sms_conversation_detail.messages", () =>
        supabase
          .from("messages")
          .select(
            "id, created_at, direction, body, viewed_at, metadata, phone_call_id, message_type, external_message_sid, phone_message_attachments ( id, content_type, file_name, provider_media_index )"
          )
          .eq("conversation_id", conversationId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(WORKSPACE_SMS_THREAD_INITIAL_MESSAGE_LIMIT)
      )
    : await supabase
        .from("messages")
        .select(
          "id, created_at, direction, body, viewed_at, metadata, phone_call_id, message_type, external_message_sid, phone_message_attachments ( id, content_type, file_name, provider_media_index )"
        )
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(WORKSPACE_SMS_THREAD_INITIAL_MESSAGE_LIMIT);

  if (msgErr) {
    console.warn("[admin/phone/messages] messages:", msgErr.message);
  }

  const messages = [...(msgRows ?? [])].reverse();

  const voicemailCallIds = [
    ...new Set(
      messages
        .filter((m) => String((m as { message_type?: unknown }).message_type ?? "sms") === "voicemail")
        .map((m) => {
          const pid = (m as { phone_call_id?: unknown }).phone_call_id;
          return pid != null && String(pid).trim() !== "" ? String(pid).trim() : null;
        })
        .filter((x): x is string => Boolean(x))
    ),
  ];

  const voicemailDetailByCallId: Record<
    string,
    { durationSeconds: number | null; transcript: string | null }
  > = {};

  if (voicemailCallIds.length > 0) {
    const { data: vmCalls, error: vmErr } = await supabaseAdmin
      .from("phone_calls")
      .select("id, voicemail_duration_seconds, metadata")
      .in("id", voicemailCallIds);
    if (vmErr) {
      console.warn("[admin/phone/messages] voicemail detail:", vmErr.message);
    }
    for (const c of vmCalls ?? []) {
      const id = typeof c.id === "string" ? c.id : "";
      if (!id) continue;
      const meta = c.metadata;
      let transcript: string | null = null;
      if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const vt = (meta as Record<string, unknown>).voicemail_transcription;
        if (vt && typeof vt === "object" && !Array.isArray(vt)) {
          const t = (vt as Record<string, unknown>).text;
          transcript = typeof t === "string" && t.trim() ? t.trim().slice(0, 1200) : null;
        }
      }
      voicemailDetailByCallId[id] = {
        durationSeconds:
          typeof c.voicemail_duration_seconds === "number" && Number.isFinite(c.voicemail_duration_seconds)
            ? c.voicemail_duration_seconds
            : null,
        transcript,
      };
    }
  }

  /** Latest inbound message: Twilio `To` (business line), for Text-from seed when `preferred_from_e164` is unset. */
  const lastInboundBusinessLineE164 = (() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (String(m.direction).toLowerCase() !== "inbound") continue;
      const meta = m.metadata;
      if (meta && typeof meta === "object" && !Array.isArray(meta)) {
        const to = (meta as Record<string, unknown>).inbound_to_e164;
        if (typeof to === "string" && to.trim()) return to.trim();
      }
      return null;
    }
    return null;
  })();

  const workspacePreferredFromE164 =
    conv.preferred_from_e164 != null && String(conv.preferred_from_e164).trim() !== ""
      ? String(conv.preferred_from_e164).trim()
      : null;
  const convMetaObj =
    conv.metadata && typeof conv.metadata === "object" && !Array.isArray(conv.metadata)
      ? (conv.metadata as Record<string, unknown>)
      : null;
  const workspacePreferredFromExplicit = convMetaObj?.[SMS_OUTBOUND_FROM_EXPLICIT_KEY] === true;

  const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
  const lastInboundMessageId =
    lastMsg && String(lastMsg.direction).toLowerCase() === "inbound" ? String(lastMsg.id) : null;
  const suggestionMeta = smsAiSuggestionsEnabled ? parseSmsReplySuggestion(conv.metadata) : null;
  const initialSmsSuggestion =
    smsAiSuggestionsEnabled &&
    suggestionMeta &&
    lastInboundMessageId &&
    suggestionMeta.for_message_id === lastInboundMessageId
      ? suggestionMeta.text
      : null;

  const unreadInboundCount = messages.filter(
    (m) =>
      String(m.direction).toLowerCase() === "inbound" &&
      (m.viewed_at == null || (typeof m.viewed_at === "string" && m.viewed_at.trim() === ""))
  ).length;
  const lastMessageDirection =
    lastMsg && typeof lastMsg.direction === "string" ? lastMsg.direction.trim().toLowerCase() : null;
  const hasUnviewedInbound = unreadInboundCount > 0;

  const recentMmsHydrationForDebug = showSmsThreadDebug
    ? messages.slice(-40).map((raw) => {
        const rr = raw as {
          id: unknown;
          body?: unknown;
          external_message_sid?: unknown;
          phone_message_attachments?: unknown;
        };
        const atRaw = rr.phone_message_attachments;
        const bodyTrim = typeof rr.body === "string" ? rr.body.trim() : "";
        return {
          messageId: String(rr.id ?? ""),
          externalMessageSid:
            typeof rr.external_message_sid === "string" && rr.external_message_sid.trim()
              ? rr.external_message_sid.trim()
              : null,
          bodyLen: bodyTrim.length,
          attachmentCount: Array.isArray(atRaw) ? atRaw.length : 0,
        };
      })
    : undefined;

  const draftRaw = typeof sp.draft === "string" ? sp.draft : Array.isArray(sp.draft) ? sp.draft[0] : "";
  const composerInitialDraft =
    !initialSmsSuggestion && typeof draftRaw === "string" && draftRaw.trim()
      ? draftRaw.trim().slice(0, 1600)
      : null;

  const leadIdFromUrl =
    typeof sp.leadId === "string"
      ? sp.leadId.trim()
      : Array.isArray(sp.leadId)
        ? (sp.leadId[0] ?? "").trim()
        : "";

  const contactsRaw = conv.contacts;
  const contact =
    contactsRaw && typeof contactsRaw === "object" && !Array.isArray(contactsRaw)
      ? (contactsRaw as Record<string, unknown>)
      : Array.isArray(contactsRaw) && contactsRaw[0] && typeof contactsRaw[0] === "object"
        ? (contactsRaw[0] as Record<string, unknown>)
        : null;

  const contactName = (() => {
    if (!contact) return null;
    const fn = typeof contact.full_name === "string" ? contact.full_name.trim() : "";
    if (fn) return fn;
    const a = typeof contact.first_name === "string" ? contact.first_name : "";
    const b = typeof contact.last_name === "string" ? contact.last_name : "";
    const parts = [a, b].filter(Boolean).join(" ").trim();
    return parts || null;
  })();

  const phoneDisplay =
    typeof conv.main_phone_e164 === "string" && conv.main_phone_e164.trim() !== ""
      ? conv.main_phone_e164
      : "—";

  const unknownTexter =
    !conv.primary_contact_id &&
    conv.metadata &&
    typeof conv.metadata === "object" &&
    !Array.isArray(conv.metadata) &&
    (conv.metadata as Record<string, unknown>).unknown_texter === true;

  const leadStatus = normalizeConversationLeadStatusForInsert(conv.lead_status);

  const mainE164 = typeof conv.main_phone_e164 === "string" ? conv.main_phone_e164.trim() : "";
  const primaryContactId =
    conv.primary_contact_id != null && String(conv.primary_contact_id).trim() !== ""
      ? String(conv.primary_contact_id)
      : "";

  const phoneDisplayFormatted =
    mainE164 && mainE164 !== "" ? formatPhoneForDisplay(mainE164) : phoneDisplay;

  const directoryIdentity = mainE164
    ? routePerfStepsEnabled()
      ? await routePerfTimed("sms_conversation_detail.directory_identity", () =>
          resolvePhoneDisplayIdentity(supabase, mainE164)
        )
      : await resolvePhoneDisplayIdentity(supabase, mainE164)
    : null;

  const threadDisplayTitle = (() => {
    if (contactName) return contactName;
    if (directoryIdentity?.resolvedFromEntity && directoryIdentity.displayTitle.trim()) {
      return directoryIdentity.displayTitle.trim();
    }
    if (unknownTexter) return "Unknown";
    return phoneDisplayFormatted;
  })();

  const workspaceCallHref =
    mainE164 && isValidE164(mainE164)
      ? buildWorkspaceKeypadCallHref({
          dial: mainE164,
          leadId: leadIdFromUrl && UUID_RE.test(leadIdFromUrl) ? leadIdFromUrl : undefined,
          contactId: primaryContactId && UUID_RE.test(primaryContactId) ? primaryContactId : undefined,
          contextName: threadDisplayTitle !== phoneDisplayFormatted ? threadDisplayTitle : contactName ?? undefined,
        })
      : null;

  let linkedLeadIdForMmsSave: string | null = null;
  if (primaryContactId) {
    const leadPromise = leadRowsActiveOnly(
      supabase.from("leads").select("id").eq("contact_id", primaryContactId).limit(1)
    ).maybeSingle();
    const { data: leadRow } = routePerfStepsEnabled()
      ? await routePerfTimed("sms_conversation_detail.linked_lead_lookup", () => leadPromise)
      : await leadPromise;
    if (leadRow && typeof leadRow.id === "string") linkedLeadIdForMmsSave = leadRow.id;
  }

  const workspaceLeadId: string | null = workspaceShell ? linkedLeadIdForMmsSave : null;

  let workspacePatientId: string | null = null;
  let canOpenWorkspacePatientDetail = false;
  if (workspaceShell && primaryContactId) {
    const { data: patRow } = routePerfStepsEnabled()
      ? await routePerfTimed("sms_conversation_detail.workspace_patient_lookup", () =>
          supabase.from("patients").select("id").eq("contact_id", primaryContactId).maybeSingle()
        )
      : await supabase.from("patients").select("id").eq("contact_id", primaryContactId).maybeSingle();
    if (patRow && typeof patRow.id === "string") workspacePatientId = patRow.id;

    if (workspacePatientId) {
      const { data: assignRows } = routePerfStepsEnabled()
        ? await routePerfTimed("sms_conversation_detail.workspace_patient_assignment", () =>
            supabaseAdmin
              .from("patient_assignments")
              .select("id")
              .eq("patient_id", workspacePatientId)
              .eq("assigned_user_id", staff.user_id)
              .eq("is_active", true)
              .limit(1)
          )
        : await supabaseAdmin
            .from("patient_assignments")
            .select("id")
            .eq("patient_id", workspacePatientId)
            .eq("assigned_user_id", staff.user_id)
            .eq("is_active", true)
            .limit(1);
      canOpenWorkspacePatientDetail = Boolean(assignRows?.length);
    }
  }

  const canOpenLeadInCrm = Boolean(workspaceLeadId) && !isWorkspaceEmployeeRole(staff.role);

  const workspaceEntityLabel = (() => {
    if (!conv.primary_contact_id && unknownTexter) return "Unknown";
    if (workspacePatientId) return "Patient";
    if (workspaceLeadId) return "Lead";
    const ct = contact && typeof contact.contact_type === "string" ? contact.contact_type.trim() : "";
    if (ct) {
      const lab = labelForContactType(ct);
      if (lab !== "—") return lab;
    }
    return conv.primary_contact_id ? "Contact" : "Unknown";
  })();

  const leadBadge = (() => {
    switch (leadStatus) {
      case "spoke":
        return (
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-900">
            Spoke
          </span>
        );
      case "verify_insurance":
        return (
          <span className="inline-flex items-center rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-900">
            Verify insurance
          </span>
        );
      case "scheduled":
        return (
          <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900">
            Scheduled
          </span>
        );
      case "admitted":
        return (
          <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-900">
            Admitted
          </span>
        );
      case "not_qualified":
        return (
          <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-900">
            Not qualified
          </span>
        );
      case "new":
      default:
        return (
          <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
            New
          </span>
        );
    }
  })();

  const nextAction =
    typeof conv.next_action === "string" && conv.next_action.trim() ? conv.next_action.trim() : "";
  const followUpDueAt =
    typeof conv.follow_up_due_at === "string" && conv.follow_up_due_at.trim()
      ? conv.follow_up_due_at
      : null;
  const followUpCompletedAt =
    typeof conv.follow_up_completed_at === "string" && conv.follow_up_completed_at.trim()
      ? conv.follow_up_completed_at
      : null;

  const threadMessages = messages.map((m) => {
    const row = m as {
      id: unknown;
      created_at?: unknown;
      direction?: unknown;
      body?: unknown;
      metadata?: unknown;
      phone_call_id?: unknown;
      message_type?: unknown;
      phone_message_attachments?: unknown;
    };
    const phoneCallId =
      row.phone_call_id != null && String(row.phone_call_id).trim() !== ""
        ? String(row.phone_call_id).trim()
        : null;
    const attachments = mapSupabaseNestedPhoneAttachments(row.phone_message_attachments);
    const messageType =
      typeof row.message_type === "string" && row.message_type.trim() ? row.message_type.trim() : "sms";
    const direction = String(row.direction ?? "");
    const outbound_status_raw =
      String(direction).toLowerCase() === "outbound"
        ? extractSmsProviderStatusRaw(
            m as { metadata?: unknown; direction?: unknown; status?: unknown; twilio_status?: unknown }
          )
        : null;
    return {
      id: String(row.id),
      created_at: typeof row.created_at === "string" ? row.created_at : null,
      direction,
      body: typeof row.body === "string" ? row.body : null,
      message_type: messageType,
      phone_call_id: phoneCallId,
      fax: readWorkspaceSmsThreadFax(row.metadata),
      attachments,
      outbound_status_raw,
    };
  });

  /** Workspace thread now mounts SMS only; CRM actions live on the CRM route to avoid hidden panel work. */

  if (workspaceShell) {
    const threadView = (
      <WorkspaceSmsThreadViewLazy
        conversationId={conversationId}
        initialMessages={threadMessages}
        voicemailDetailByCallId={voicemailDetailByCallId}
        initialSuggestion={initialSmsSuggestion}
        suggestionForMessageId={
          initialSmsSuggestion && suggestionMeta ? suggestionMeta.for_message_id : null
        }
        composerInitialDraft={composerInitialDraft}
        smsPreferredFromE164={workspacePreferredFromE164}
        smsPreferredFromExplicit={workspacePreferredFromExplicit}
        smsInboundToE164={lastInboundBusinessLineE164}
        smsLeadInsuranceTargetId={linkedLeadIdForMmsSave}
        smsThreadMmsDiag={showSmsThreadDebug}
      />
    );

    const shell = (
      <>
        <SmsThreadMarkReadOnViewClient conversationId={conversationId} />
        <WorkspaceSmsConversationShell
          inboxHref={inboxHref}
          initialDisplayName={threadDisplayTitle}
          initialPhoneLine={phoneDisplayFormatted}
          initialBadge={workspaceEntityLabel}
          workspaceCallHref={workspaceCallHref}
          smsThreadPaneId={conversationId}
          appDesktopSplit={workspaceDesktopSplit}
          threadActions={
            <WorkspaceSmsDeleteConversationButton
              conversationId={conversationId}
              afterDeleteHref={inboxHref}
              compact={workspaceDesktopSplit}
            />
          }
          headerAside={
          canOpenLeadInCrm && workspaceLeadId ? (
            <Link
              href={`/admin/crm/leads/${workspaceLeadId}`}
              className="text-[12px] font-semibold text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline"
            >
              View CRM
            </Link>
          ) : workspacePatientId && canOpenWorkspacePatientDetail ? (
            <Link
              href={`/workspace/phone/patients/${workspacePatientId}`}
              className="text-[12px] font-semibold text-sky-800 underline-offset-2 hover:text-sky-950 hover:underline"
            >
              View patient
            </Link>
          ) : workspacePatientId ? (
            <Link
              href="/workspace/phone/patients"
              className="text-[12px] font-semibold text-slate-600 underline-offset-2 hover:underline"
            >
              Patients
            </Link>
          ) : null
          }
          banners={
          <>
            {showSmsThreadDebug ? (
              <div className="mx-4 mt-2">
                <SmsThreadDebugStrip
                  conversationId={conversationId}
                  unreadInboundCount={unreadInboundCount}
                  lastMessageDirection={lastMessageDirection}
                  hasUnviewedInbound={hasUnviewedInbound}
                  recentMmsHydration={recentMmsHydrationForDebug}
                />
              </div>
            ) : null}
            {ok === "intake" ? (
              <div className="mx-4 mt-2 rounded-lg border border-sky-200/90 bg-phone-ice px-3 py-2 text-sm text-phone-ink">
                Contact saved and linked to this thread.
              </div>
            ) : null}
            {ok === "sms_sent" ? (
              <div className="mx-4 mt-2 rounded-lg border border-sky-200/90 bg-phone-ice px-3 py-2 text-sm text-phone-ink">
                Message sent.
              </div>
            ) : null}
            {intakeErr ? (
              <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                {intakeErr}
              </div>
            ) : null}
            {smsSendErr ? (
              <div className="mx-4 mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                {smsSendErr}
              </div>
            ) : null}
            {leadIdFromUrl && UUID_RE.test(leadIdFromUrl) ? (
              <div className="mx-4 mt-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
                Deep-linked lead:{" "}
                <Link href={`/admin/crm/leads/${leadIdFromUrl}`} className="font-semibold underline">
                  Open in CRM
                </Link>
              </div>
            ) : null}
          </>
          }
        >
          {threadView}
        </WorkspaceSmsConversationShell>
      </>
    );

    if (perfStart) {
      routePerfLog("workspace/phone/inbox/thread", perfStart);
    }

    return shell;
  }

  if (perfStart) {
    routePerfLog("admin/phone/messages/thread", perfStart);
  }

  return (
    <>
      <SmsThreadMarkReadOnViewClient conversationId={conversationId} />
      <div
        className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4 sm:gap-6 sm:p-6"
        data-sms-thread-pane={conversationId}
      >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href={inboxHref} className="text-sm font-medium text-sky-800 hover:underline">
            ← Inbox
          </Link>
          <h1 className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">{threadDisplayTitle}</h1>
          {threadDisplayTitle !== phoneDisplayFormatted ? (
            <p className="mt-0.5 text-sm text-slate-600">{phoneDisplayFormatted}</p>
          ) : null}
        </div>
        <WorkspaceSmsDeleteConversationButton
          conversationId={conversationId}
          afterDeleteHref={inboxHref}
        />
      </div>

      {ok === "intake" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Contact saved and linked to this thread.
        </div>
      ) : null}
      {ok === "sms_sent" ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Message sent.
        </div>
      ) : null}
      {intakeErr ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {intakeErr}
        </div>
      ) : null}
      {smsSendErr ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
          {smsSendErr}
        </div>
      ) : null}

      {leadIdFromUrl && UUID_RE.test(leadIdFromUrl) ? (
        <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          Open this lead in CRM:{" "}
          <Link
            href={`/admin/crm/leads/${leadIdFromUrl}`}
            className="font-semibold text-sky-900 underline-offset-2 hover:underline"
          >
            Lead record
          </Link>
        </div>
      ) : null}

      {showSmsThreadDebug ? (
        <SmsThreadDebugStrip
          conversationId={conversationId}
          unreadInboundCount={unreadInboundCount}
          lastMessageDirection={lastMessageDirection}
          hasUnviewedInbound={hasUnviewedInbound}
          recentMmsHydration={recentMmsHydrationForDebug}
        />
      ) : null}

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Assignment</h2>
        <div className="mt-3 space-y-3 text-sm">
          <div>
            <p className="text-xs font-medium text-slate-500">Lead status</p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              {leadBadge}
              <form action={updateConversationLeadStatus} className="flex items-center gap-2">
                <input type="hidden" name="conversationId" value={conversationId} />
                <label className="sr-only" htmlFor="leadStatus">
                  Lead status
                </label>
                <select
                  id="leadStatus"
                  name="leadStatus"
                  defaultValue={leadStatus}
                  required
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-900"
                >
                  <option value="new">New</option>
                  <option value="spoke">Spoke</option>
                  <option value="verify_insurance">Verify insurance</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="admitted">Admitted</option>
                  <option value="not_qualified">Not qualified</option>
                </select>
                <button
                  type="submit"
                  className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  Update
                </button>
              </form>
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Assigned to</p>
            <p className="mt-1 font-medium text-slate-900">{assigneeLabel ?? "Unassigned"}</p>
            {conv.assigned_at ? (
              <p className="mt-0.5 text-xs text-slate-500">
                Since {formatAdminPhoneWhen(typeof conv.assigned_at === "string" ? conv.assigned_at : null)}
              </p>
            ) : null}
          </div>
          {canClaim ? (
            <form action={claimConversation}>
              <input type="hidden" name="conversationId" value={conversationId} />
              <button
                type="submit"
                className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
              >
                Claim conversation
              </button>
            </form>
          ) : null}
          {hasFull ? (
            <form action={assignConversation} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="conversationId" value={conversationId} />
              <label className="text-slate-600">
                Reassign
                <select
                  name="assignToUserId"
                  defaultValue={assignedTo ?? ""}
                  required
                  className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-slate-900"
                >
                  <option value="" disabled>
                    Select staff…
                  </option>
                  {assignedTo && !assignableStaff.some((s) => s.user_id === assignedTo) ? (
                    <option value={assignedTo}>{assigneeLabel ?? `${assignedTo.slice(0, 8)}…`} (current)</option>
                  ) : null}
                  {assignableStaff.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                Assign
              </button>
            </form>
          ) : null}
          {isAdminOrHigher(staff) ? (
            <form action={unassignConversation} className="pt-1">
              <input type="hidden" name="conversationId" value={conversationId} />
              <button
                type="submit"
                className="text-xs font-medium text-slate-500 underline hover:text-slate-800"
              >
                Unassign (admin)
              </button>
            </form>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">Next action</h2>
        <div className="mt-3 space-y-3 text-sm">
          {followUpCompletedAt ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-2 text-emerald-900">
              Completed {formatAdminPhoneWhen(followUpCompletedAt)}
            </div>
          ) : null}

          <form action={updateConversationFollowUp} className="space-y-3">
            <input type="hidden" name="conversationId" value={conversationId} />

            <div>
              <label className="block text-xs font-medium text-slate-600">Next action</label>
              <input
                name="nextAction"
                defaultValue={nextAction}
                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
                placeholder="e.g. Call back / Schedule assessment"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600">Due</label>
              <input
                type="datetime-local"
                name="dueAt"
                defaultValue={isoToDatetimeLocalValue(followUpDueAt)}
                className="mt-0.5 w-full rounded border border-slate-200 bg-white px-2 py-1.5 text-sm"
              />
              {followUpDueAt ? (
                <p className="mt-1 text-[11px] text-slate-500">
                  Current: {formatAdminPhoneWhen(followUpDueAt)}
                </p>
              ) : (
                <p className="mt-1 text-[11px] text-slate-500">Optional</p>
              )}
            </div>

            <button
              type="submit"
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700"
            >
              Save / update
            </button>
          </form>

          {!followUpCompletedAt ? (
            <>
              <form action={completeConversationFollowUp}>
                <input type="hidden" name="conversationId" value={conversationId} />
                <button
                  type="submit"
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-800 hover:bg-slate-50"
                >
                  Mark complete
                </button>
              </form>
              <form action={clearConversationFollowUp}>
                <input type="hidden" name="conversationId" value={conversationId} />
                <button
                  type="submit"
                  className="w-full text-xs font-medium text-slate-500 underline hover:text-slate-800"
                >
                  Clear next action
                </button>
              </form>
            </>
          ) : null}
        </div>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900">CRM</h2>
        {contact && conv.primary_contact_id ? (
          <dl className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2">
            <div>
              <dt className="text-xs text-slate-500">Name</dt>
              <dd>{contactName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Type</dt>
              <dd>{typeof contact.contact_type === "string" ? contact.contact_type : "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-slate-500">Email</dt>
              <dd>{typeof contact.email === "string" && contact.email.trim() ? contact.email : "—"}</dd>
            </div>
          </dl>
        ) : (
          <div className="mt-3">
            {unknownTexter ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-sm text-amber-950">
                New unknown texter — not in CRM yet (auto-detected from SMS). Add a contact below when
                ready.
              </p>
            ) : (
              <p className="text-sm text-slate-600">No linked contact.</p>
            )}
            <form
              action={createContactIntakeFromConversation}
              className="mt-3 max-w-md space-y-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3"
            >
              <input type="hidden" name="conversationId" value={conversationId} />
              {workspaceShell ? (
                <input
                  type="hidden"
                  name="returnTo"
                  value={workspaceDesktopSplit ? "workspace_inbox" : "workspace"}
                />
              ) : null}
              <div className="space-y-2">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">First name</label>
                    <input
                      name="firstName"
                      className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Last name</label>
                    <input
                      name="lastName"
                      className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      placeholder="Last name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600">
                    Full name <span className="text-slate-500">(optional if first name provided)</span>
                  </label>
                  <input
                    name="fullName"
                    className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder="Full name"
                  />
                  <p className="mt-1 text-[11px] text-slate-500">Required: first name OR full name.</p>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">Phone</label>
                <input
                  name="phone"
                  required
                  defaultValue={phoneDisplay !== "—" ? phoneDisplay : ""}
                  className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">Type</label>
                <select
                  name="intakeType"
                  required
                  className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                  defaultValue="patient"
                >
                  <option value="patient">Patient</option>
                  <option value="family">Family</option>
                  <option value="referral">Referral</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600">Email</label>
                  <input
                    name="email"
                    className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder="Email"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600">Referral source</label>
                  <input
                    name="referralSource"
                    className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder="Referral source"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600">Address line 1</label>
                  <input
                    name="addressLine1"
                    className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                    placeholder="Address line 1"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600">City</label>
                    <input
                      name="city"
                      className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">State</label>
                    <input
                      name="state"
                      className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      placeholder="State"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600">Zip</label>
                    <input
                      name="zip"
                      className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1.5 text-sm"
                      placeholder="Zip"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600">Notes</label>
                <textarea
                  name="notes"
                  rows={3}
                  className="mt-0.5 w-full resize-none rounded border border-slate-200 px-2 py-1.5 text-sm"
                  placeholder="Notes"
                />
              </div>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-slate-800"
              >
                Create contact / intake
              </button>
            </form>
          </div>
        )}
      </section>

      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-slate-50/50">
        <h2 className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900">
          Messages
        </h2>
        <div className="max-h-[min(60vh,520px)] flex-1 space-y-3 overflow-y-auto px-4 py-3">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">No messages yet.</p>
          ) : (
            messages.map((m) => {
              const inbound = String(m.direction).toLowerCase() === "inbound";
              const msgType = String((m as { message_type?: unknown }).message_type ?? "sms");
              const pid =
                (m as { phone_call_id?: unknown }).phone_call_id != null
                  ? String((m as { phone_call_id?: unknown }).phone_call_id).trim()
                  : "";
              if (msgType === "voicemail" && pid) {
                const detail = voicemailDetailByCallId[pid];
                return (
                  <div key={String(m.id)} className="flex justify-start">
                    <VoicemailThreadMessageRow
                      conversationId={conversationId}
                      messageId={String(m.id)}
                      phoneCallId={pid}
                      createdAt={typeof m.created_at === "string" ? m.created_at : null}
                      body={typeof m.body === "string" ? m.body : null}
                      detail={detail}
                    />
                  </div>
                );
              }
              const attachments =
                mapSupabaseNestedPhoneAttachments(
                  (m as { phone_message_attachments?: unknown }).phone_message_attachments
                ) ?? [];
              const bodyTrim =
                typeof m.body === "string" ? m.body.trim() : String(m.body ?? "").trim();
              const hasMedia = attachments.length > 0;
              return (
                <div key={String(m.id)} className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                      inbound
                        ? "border border-slate-200 bg-white text-slate-900"
                        : "bg-sky-700 text-white"
                    }`}
                  >
                    {bodyTrim !== "" ? (
                      <p className="whitespace-pre-wrap break-words">{bodyTrim}</p>
                    ) : null}
                    {hasMedia ? (
                      <SmsMessageMediaAttachments
                        inbound={inbound}
                        attachments={attachments}
                        smsLeadInsuranceTargetId={linkedLeadIdForMmsSave}
                      />
                    ) : null}
                    <p
                      className={`mt-1 text-[10px] ${
                        inbound ? "text-slate-500" : "text-sky-100"
                      }`}
                    >
                      {formatAdminPhoneWhen(typeof m.created_at === "string" ? m.created_at : null)} ·{" "}
                      {inbound
                        ? "Inbound"
                        : formatSmsOutboundDeliveryLabel(
                            extractSmsProviderStatusRaw(
                              m as { metadata?: unknown; direction?: unknown; status?: unknown }
                            ),
                            { isOptimistic: false }
                          )}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <SmsReplyComposer
          conversationId={conversationId}
          initialSuggestion={initialSmsSuggestion}
          suggestionForMessageId={
            initialSmsSuggestion && suggestionMeta ? suggestionMeta.for_message_id : null
          }
          initialDraft={composerInitialDraft}
        />
      </section>
    </div>
    </>
  );
}
