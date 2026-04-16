import "server-only";

/**
 * SMS reply suggestions: runs only from inbound webhook after the message row exists.
 * Never reads or writes `messages.viewed_at`, never marks read, never touches unread state.
 * Only updates `conversations.metadata` (suggestion + telemetry).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { fetchOpenAiJsonObject } from "@/lib/phone/phone-call-ai-context";
import { mergeTelemetryOnGeneration } from "@/lib/phone/sms-suggestion-telemetry";

/** Max recent messages sent to the model (newest window). */
const SMS_AI_CONTEXT_MESSAGE_COUNT = 10;
/** Per-message body cap in the prompt (keeps token use bounded). */
const SMS_AI_BODY_MAX_CHARS = 500;

const SMS_REPLY_SYSTEM = `You help Saintly Home Health staff draft SMS replies. Output is for staff to edit—nothing is sent automatically.

Rules:
- Reply in one or two short sentences only (roughly 1–2 sentences). No bullet lists.
- Stay under ~320 characters. Warm, professional, plain language.
- Address the latest inbound message first; use the short thread below only for necessary context.
- Do not invent clinical details, referral IDs, timelines, or PHI. No medical diagnoses or guarantees.
- If unsafe to guess, return an empty string.

Voice-call context (if provided) may hint category/urgency—use lightly; SMS thread is primary.

Return a single JSON object with exactly one key: "suggested_reply" (string). If you cannot suggest safely, return {"suggested_reply":""}.`;

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function voiceAiContextFromCallMetadata(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return "(none)";
  const v = (metadata as Record<string, unknown>).voice_ai;
  if (!v || typeof v !== "object" || Array.isArray(v)) return "(none)";
  const o = v as Record<string, unknown>;
  const cat = typeof o.caller_category === "string" ? o.caller_category.trim().toLowerCase() : "";
  if (cat === "spam") {
    return "(caller marked spam in voice AI — do not engage)";
  }
  const lines: string[] = [];
  if (typeof o.short_summary === "string" && o.short_summary.trim()) {
    lines.push(`Summary: ${o.short_summary.trim().slice(0, 500)}`);
  }
  if (typeof o.caller_category === "string" && o.caller_category.trim()) {
    lines.push(`Caller category: ${o.caller_category.trim()}`);
  }
  if (typeof o.callback_needed === "boolean") {
    lines.push(`Callback needed: ${o.callback_needed ? "yes" : "no"}`);
  }
  if (typeof o.urgency === "string" && o.urgency.trim()) {
    lines.push(`Urgency: ${o.urgency.trim()}`);
  }
  if (typeof o.route_target === "string" && o.route_target.trim()) {
    lines.push(`Route: ${o.route_target.trim()}`);
  }
  const crm = o.crm_suggestion;
  if (crm && typeof crm === "object" && !Array.isArray(crm)) {
    const c = crm as Record<string, unknown>;
    const t = typeof c.type === "string" ? c.type : "";
    const oc = typeof c.outcome === "string" ? c.outcome : "";
    if (t || oc) {
      lines.push(`Suggested CRM type/outcome: ${t || "—"} / ${oc || "—"}`);
    }
  }
  return lines.length ? lines.join("\n") : "(none)";
}

function parseSuggestedReply(raw: unknown): string {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return "";
  const s = (raw as Record<string, unknown>).suggested_reply;
  if (typeof s !== "string") return "";
  return s.replace(/\s+/g, " ").trim().slice(0, 420);
}

function smsAiSuggestionsDisabled(): boolean {
  return process.env.SMS_AI_SUGGESTIONS_DISABLED === "1";
}

export async function runSmsReplySuggestionGeneration(
  supabase: SupabaseClient,
  input: { conversationId: string; inboundMessageId: string; mainPhoneE164: string }
): Promise<void> {
  if (smsAiSuggestionsDisabled()) {
    return;
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return;
  }

  const { conversationId, inboundMessageId, mainPhoneE164 } = input;
  const phone = mainPhoneE164.trim();
  if (!phone) return;

  const { data: callRow, error: callErr } = await supabase
    .from("phone_calls")
    .select("metadata")
    .eq("from_e164", phone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (callErr) {
    console.warn("[sms-reply-suggestion] phone_calls:", callErr.message);
  }

  const voiceCtx = voiceAiContextFromCallMetadata(callRow?.metadata);
  if (voiceCtx.includes("spam")) {
    return;
  }

  const { data: msgRowsDesc, error: msgErr } = await supabase
    .from("messages")
    .select("id, created_at, direction, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(SMS_AI_CONTEXT_MESSAGE_COUNT);

  if (msgErr || !msgRowsDesc?.length) {
    if (msgErr) console.warn("[sms-reply-suggestion] messages:", msgErr.message);
    return;
  }

  const msgRows = [...msgRowsDesc].reverse();

  let inboundCount = 0;
  let outboundCount = 0;
  const lines: string[] = [];
  for (const m of msgRows) {
    const isIn = String(m.direction ?? "").toLowerCase() === "inbound";
    if (isIn) inboundCount++;
    else outboundCount++;
    const dir = isIn ? "Inbound (contact)" : "Outbound (staff)";
    const body = typeof m.body === "string" ? m.body.trim() : "";
    lines.push(`${dir}: ${body.slice(0, SMS_AI_BODY_MAX_CHARS)}`);
  }

  let latestInbound: { id: string; body: string } | null = null;
  for (let i = msgRows.length - 1; i >= 0; i--) {
    const m = msgRows[i];
    if (String(m.direction ?? "").toLowerCase() === "inbound") {
      latestInbound = {
        id: String(m.id),
        body: typeof m.body === "string" ? m.body.trim() : "",
      };
      break;
    }
  }

  const latestInboundBlock =
    latestInbound != null
      ? `Latest inbound (reply target):\n---\n${latestInbound.body.slice(0, SMS_AI_BODY_MAX_CHARS)}\n---`
      : "";

  const userBlock = [
    `Voice-call context (optional):\n${voiceCtx}`,
    latestInboundBlock,
    `Recent SMS only (last ${msgRows.length} messages, oldest first — ${inboundCount} inbound / ${outboundCount} outbound):\n${lines.join("\n")}`,
  ]
    .filter((s) => s.length > 0)
    .join("\n\n");

  const parsed = await fetchOpenAiJsonObject(SMS_REPLY_SYSTEM, userBlock);
  const text = parseSuggestedReply(parsed);
  if (!text) {
    return;
  }

  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, metadata")
    .eq("id", conversationId)
    .maybeSingle();

  if (convErr || !conv?.id) {
    if (convErr) console.warn("[sms-reply-suggestion] conversation:", convErr.message);
    return;
  }

  const prevMeta = asMetadata(conv.metadata);
  const generatedAt = new Date().toISOString();
  const nextMeta = {
    ...prevMeta,
    sms_reply_suggestion: {
      text,
      for_message_id: inboundMessageId,
      generated_at: generatedAt,
    },
    sms_suggestion_telemetry: mergeTelemetryOnGeneration(prevMeta, inboundMessageId, generatedAt),
  };

  const { error: upErr } = await supabase.from("conversations").update({ metadata: nextMeta }).eq("id", conversationId);

  if (upErr) {
    console.warn("[sms-reply-suggestion] persist:", upErr.message);
    return;
  }

  try {
    revalidatePath("/admin/phone/messages");
    revalidatePath(`/admin/phone/messages/${conversationId}`);
    revalidatePath("/workspace/phone/inbox");
    revalidatePath(`/workspace/phone/inbox/${conversationId}`);
  } catch {
    /* ignore */
  }
}

export function scheduleSmsReplySuggestionGeneration(
  supabase: SupabaseClient,
  conversationId: string,
  inboundMessageId: string,
  mainPhoneE164: string
): void {
  if (smsAiSuggestionsDisabled()) {
    return;
  }

  queueMicrotask(() => {
    void runSmsReplySuggestionGeneration(supabase, {
      conversationId,
      inboundMessageId,
      mainPhoneE164,
    }).catch((e) => {
      console.warn("[sms-reply-suggestion] unhandled:", e);
    });
  });
}
