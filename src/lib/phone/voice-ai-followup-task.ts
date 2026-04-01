import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import {
  formatVoiceAiCallerCategoryLabel,
  formatVoiceAiRouteTargetLabel,
} from "@/app/admin/phone/_lib/voice-ai-metadata";

/** Matches `VoiceAiStoredPayload` fields used here (avoids importing voice-ai-background). */
export type VoiceAiFollowupPayload = {
  caller_category: string;
  route_target: string;
  urgency: string;
  callback_needed: boolean;
  short_summary: string;
  crm_suggestion: { type: string; outcome: string; tags: string; note: string };
};

const DUPLICATE_KEY = "23505";

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === DUPLICATE_KEY) return true;
  return /duplicate key|unique constraint/i.test(error.message || "");
}

const TITLE_MAX = 500;
const DESC_MAX = 12000;

function priorityFromUrgency(urgency: string): "low" | "normal" | "high" | "urgent" {
  const u = urgency.trim().toLowerCase();
  if (u === "critical") return "urgent";
  if (u === "high") return "high";
  if (u === "low") return "low";
  return "normal";
}

function shouldCreateFollowupTask(payload: VoiceAiFollowupPayload): boolean {
  if (payload.callback_needed === true) return true;
  const rt = typeof payload.route_target === "string" ? payload.route_target.trim().toLowerCase() : "";
  return rt !== "" && rt !== "noop";
}

function buildTitle(payload: VoiceAiFollowupPayload): string {
  const caller = formatVoiceAiCallerCategoryLabel(payload.caller_category);
  const route = formatVoiceAiRouteTargetLabel(payload.route_target);
  const t = `AI follow-up: ${caller} · ${route}`;
  return t.length <= TITLE_MAX ? t : t.slice(0, TITLE_MAX);
}

function buildDescription(callId: string, payload: VoiceAiFollowupPayload): string {
  const crm = payload.crm_suggestion;
  const type = crm?.type?.trim() || "—";
  const outcome = crm?.outcome?.trim() || "—";
  const lines = [
    payload.short_summary ? `Summary: ${payload.short_summary}` : null,
    `Urgency: ${payload.urgency}`,
    `Callback needed: ${payload.callback_needed ? "yes" : "no"}`,
    `Route: ${formatVoiceAiRouteTargetLabel(payload.route_target)}`,
    `Suggested CRM type: ${type}`,
    `Suggested outcome: ${outcome}`,
    `Call record: /admin/phone/${callId}`,
  ];
  const body = lines.filter(Boolean).join("\n");
  return body.length <= DESC_MAX ? body : body.slice(0, DESC_MAX);
}

/**
 * Creates one follow-up task per call when AI classification warrants action (idempotent via partial unique index).
 * Assignment matches auto-missed-call tasks: call owner if set, else unassigned.
 */
export async function maybeEnsureVoiceAiFollowupTask(
  supabase: SupabaseClient,
  phoneCallId: string,
  payload: VoiceAiFollowupPayload
): Promise<void> {
  if (!shouldCreateFollowupTask(payload)) {
    return;
  }

  const { data: row, error: selErr } = await supabase
    .from("phone_calls")
    .select("id, assigned_to_user_id")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (selErr) {
    console.warn("[voice_ai_followup_task] select phone_calls:", selErr.message);
    return;
  }
  if (!row?.id) {
    return;
  }

  const assignTo = (row.assigned_to_user_id as string | null | undefined) ?? null;

  const { error } = await supabase.from("phone_call_tasks").insert({
    phone_call_id: phoneCallId,
    title: buildTitle(payload),
    description: buildDescription(phoneCallId, payload),
    status: "open",
    priority: priorityFromUrgency(payload.urgency),
    assigned_to_user_id: assignTo,
    created_by_user_id: null,
    source: "voice_ai_followup",
  });

  if (error) {
    if (isUniqueViolation(error)) return;
    console.warn("[voice_ai_followup_task] insert:", error.message);
    return;
  }

  try {
    revalidatePath("/admin/phone");
    revalidatePath("/admin/phone/calls");
    revalidatePath("/admin/phone/tasks");
    revalidatePath(`/admin/phone/${phoneCallId}`);
  } catch {
    /* ignore outside Next request context */
  }
}
