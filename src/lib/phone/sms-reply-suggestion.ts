import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import { fetchOpenAiJsonObject } from "@/lib/phone/phone-call-ai-context";
import { mergeTelemetryOnGeneration } from "@/lib/phone/sms-suggestion-telemetry";

const SMS_REPLY_SYSTEM = `You are an assistant for Saintly Home Health staff managing SMS text threads with patients, families, caregivers, referrers, and vendors.

Task: suggest ONE next outbound SMS for staff to review and edit—nothing is sent automatically.

Anchoring:
- A "Current reply target" block (if present) is the latest inbound message from the contact—prioritize addressing that message first. The full thread below provides broader context; do not lose sight of what they most recently asked or said.
- Prefer a concise reply unless the situation clearly needs more detail (e.g. multiple distinct points in the latest message).
- Do not repeat questions or requests that earlier messages in the thread already answered or resolved.

Tone by caller category (use "Caller category" from voice-call context when present; otherwise infer cautiously from the SMS thread):
- patient_family: warm, reassuring, plain language; clear next steps; avoid sounding rushed or clinical unless the thread already uses that tone.
- caregiver_applicant: professional, encouraging, recruiting-oriented; clear paths (how to apply, what happens next) without overpromising pay or hiring outcomes.
- referral_provider: efficient, respectful, coordination-oriented; assume referral/clinical context; minimal small talk. Lead with a direct answer or acknowledgment of what they asked in the latest inbound message; mirror names, facilities, and acronyms exactly as written in the thread. Offer one concrete next step only when the thread supports it (e.g. who will follow up or what you still need)—do not invent referral IDs, timelines, fax numbers, or clinical details. If something is missing, ask briefly for only that gap instead of switching to a generic intake script.
- vendor_other: brief, businesslike; get to the point.
- If category is absent, mixed, or unclear: default to warm, professional Saintly voice.

When voice context shows Route referral_team (even if caller category is unclear): apply the same referral-coordination discipline—prioritize the referrer’s stated request over generic reassurance.

Multi-turn behavior:
- Use the full thread (chronological) for continuity: infer ongoing intent (scheduling, billing, hiring, clinical coordination) and align with prior staff replies.
- Use voice-call context (urgency, route, summary) together with caller category to calibrate priority. Higher urgency → clearer next steps.
- When key information is still missing after reading the thread, you may ask one or two concise follow-up questions—only if not already covered above.
- When fitting, gently guide toward scheduling, callback, or intake—professional, not pushy. No medical diagnoses, guarantees, or unnecessary PHI.

Length: prefer under 320 characters; up to 800 if the conversation clearly requires it.

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
  return s.replace(/\s+/g, " ").trim().slice(0, 1600);
}

export async function runSmsReplySuggestionGeneration(
  supabase: SupabaseClient,
  input: { conversationId: string; inboundMessageId: string; mainPhoneE164: string }
): Promise<void> {
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

  const { data: msgRows, error: msgErr } = await supabase
    .from("messages")
    .select("id, created_at, direction, body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(80);

  if (msgErr || !msgRows?.length) {
    if (msgErr) console.warn("[sms-reply-suggestion] messages:", msgErr.message);
    return;
  }

  let inboundCount = 0;
  let outboundCount = 0;
  const lines: string[] = [];
  for (const m of msgRows) {
    const isIn = String(m.direction ?? "").toLowerCase() === "inbound";
    if (isIn) inboundCount++;
    else outboundCount++;
    const dir = isIn ? "Inbound (contact)" : "Outbound (staff)";
    const body = typeof m.body === "string" ? m.body.trim() : "";
    lines.push(`${dir}: ${body.slice(0, 4000)}`);
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
      ? `Current reply target — latest inbound message from the contact (address this first; full thread below provides full context):\n---\n${latestInbound.body.slice(0, 4000)}\n---`
      : "";

  const userBlock = [
    `Voice-call AI context for this phone number (may be empty—SMS thread is the live source of truth):\n${voiceCtx}`,
    latestInboundBlock,
    `Full SMS conversation (${msgRows.length} messages: ${inboundCount} from contact, ${outboundCount} from staff), oldest first:\n${lines.join("\n")}`,
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
