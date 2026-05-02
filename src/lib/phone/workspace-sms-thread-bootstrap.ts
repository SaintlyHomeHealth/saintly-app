import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { extractSmsProviderStatusRaw } from "@/lib/phone/sms-delivery-ui";
import { mapNestedPhoneAttachmentsFromRpcRow } from "@/lib/phone/map-phone-message-attachments-row";
import {
  readWorkspaceSmsThreadFax,
  WORKSPACE_SMS_THREAD_INITIAL_MESSAGE_LIMIT,
  type WorkspaceSmsThreadMessage,
} from "@/lib/phone/workspace-sms-thread-messages";
import { staffMayAccessSmsConversation } from "@/lib/phone/staff-sms-conversation-access-async";
import { staffMayAccessWorkspaceSms } from "@/lib/phone/staff-phone-policy";
import { canAccessWorkspacePhone, getStaffProfile, type StaffProfile } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { smsReplyAiSuggestionsEnabled } from "@/lib/phone/sms-ai-suggestions-flag";
import { SMS_OUTBOUND_FROM_EXPLICIT_KEY } from "@/lib/twilio/sms-from-numbers";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function requirePhoneMessagingStaff(staff: StaffProfile | null): staff is StaffProfile {
  return Boolean(staff && canAccessWorkspacePhone(staff) && staffMayAccessWorkspaceSms(staff));
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

export type WorkspaceSmsThreadBootstrapVoicemail = {
  durationSeconds: number | null;
  transcript: string | null;
};

/** Serializable props for `WorkspaceSmsThreadView` (workspace inbox and CRM embed). */
export type WorkspaceSmsThreadBootstrap = {
  conversationId: string;
  initialMessages: WorkspaceSmsThreadMessage[];
  voicemailDetailByCallId: Record<string, WorkspaceSmsThreadBootstrapVoicemail>;
  initialSuggestion: string | null;
  suggestionForMessageId: string | null;
  composerInitialDraft: null;
  smsPreferredFromE164: string | null;
  /** True when `preferred_from_e164` for the backup line was set by explicit Text-from choice. */
  smsPreferredFromExplicit: boolean;
  smsInboundToE164: string | null;
};

/**
 * Loads thread message data and composer inputs for an SMS conversation, with the same access
 * checks as the workspace inbox detail page.
 */
export async function loadWorkspaceSmsThreadBootstrap(
  conversationId: string
): Promise<{ ok: false; error: string } | { ok: true; data: WorkspaceSmsThreadBootstrap }> {
  const staff = await getStaffProfile();
  if (!requirePhoneMessagingStaff(staff)) {
    return { ok: false, error: "You do not have access to workspace phone." };
  }

  const cid = conversationId.trim();
  if (!cid || !UUID_RE.test(cid)) {
    return { ok: false, error: "Invalid conversation." };
  }

  const smsAiSuggestionsEnabled = smsReplyAiSuggestionsEnabled();
  const supabase = await createServerSupabaseClient();

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, preferred_from_e164, metadata, deleted_at, assigned_to_user_id")
    .eq("id", cid)
    .eq("channel", "sms")
    .maybeSingle();

  if (convErr || !conv?.id) {
    return { ok: false, error: "Conversation not found." };
  }

  const convDeletedAt =
    conv.deleted_at != null && String(conv.deleted_at).trim() !== "" ? String(conv.deleted_at) : null;
  if (convDeletedAt) {
    return { ok: false, error: "Conversation not found." };
  }

  const assignedTo =
    conv.assigned_to_user_id != null && String(conv.assigned_to_user_id).trim() !== ""
      ? String(conv.assigned_to_user_id)
      : null;

  const may = await staffMayAccessSmsConversation(supabase, staff, cid, {
    assigned_to_user_id: assignedTo,
  });
  if (!may) {
    return { ok: false, error: "You do not have access to this conversation." };
  }

  const { data: msgRows, error: msgErr } = await supabase
    .from("messages")
    .select(
      "id, created_at, direction, body, metadata, phone_call_id, message_type, phone_message_attachments ( id, content_type, file_name, provider_media_index )"
    )
    .eq("conversation_id", cid)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(WORKSPACE_SMS_THREAD_INITIAL_MESSAGE_LIMIT);

  if (msgErr) {
    console.warn("[workspace-sms-thread-bootstrap] messages:", msgErr.message);
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

  const voicemailDetailByCallId: Record<string, WorkspaceSmsThreadBootstrapVoicemail> = {};

  if (voicemailCallIds.length > 0) {
    const { data: vmCalls, error: vmErr } = await supabaseAdmin
      .from("phone_calls")
      .select("id, voicemail_duration_seconds, metadata")
      .in("id", voicemailCallIds);
    if (vmErr) {
      console.warn("[workspace-sms-thread-bootstrap] voicemail detail:", vmErr.message);
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
  const metaObj =
    conv.metadata != null && typeof conv.metadata === "object" && !Array.isArray(conv.metadata)
      ? (conv.metadata as Record<string, unknown>)
      : null;
  const smsPreferredFromExplicit = metaObj?.[SMS_OUTBOUND_FROM_EXPLICIT_KEY] === true;

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

  const threadMessages: WorkspaceSmsThreadMessage[] = messages.map((m) => {
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
    const messageType =
      typeof row.message_type === "string" && row.message_type.trim() ? row.message_type.trim() : "sms";
    const direction = String(row.direction ?? "");
    const outbound_status_raw =
      String(direction).toLowerCase() === "outbound"
        ? extractSmsProviderStatusRaw(
            m as { metadata?: unknown; direction?: unknown; status?: unknown; twilio_status?: unknown }
          )
        : null;
    const attachments = mapNestedPhoneAttachmentsFromRpcRow(row.phone_message_attachments);
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

  return {
    ok: true,
    data: {
      conversationId: cid,
      initialMessages: threadMessages,
      voicemailDetailByCallId,
      initialSuggestion: initialSmsSuggestion,
      suggestionForMessageId:
        initialSmsSuggestion && suggestionMeta ? suggestionMeta.for_message_id : null,
      composerInitialDraft: null,
      smsPreferredFromE164: workspacePreferredFromE164,
      smsPreferredFromExplicit,
      smsInboundToE164: lastInboundBusinessLineE164,
    },
  };
}
