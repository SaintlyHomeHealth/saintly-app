import type { PhoneCallRow } from "@/app/admin/phone/recent-calls-live";

export type CallUrgency = "normal" | "critical" | "high";

export function getCallUrgency(
  call: Pick<PhoneCallRow, "status" | "started_at" | "created_at">
): CallUrgency {
  if (call.status.trim().toLowerCase() !== "missed") return "normal";

  const now = Date.now();
  const then = new Date(call.started_at || call.created_at).getTime();
  if (!Number.isFinite(then)) return "normal";

  const diffMinutes = Math.floor((now - then) / (1000 * 60));
  if (diffMinutes <= 15) return "critical";
  if (diffMinutes <= 60) return "high";
  return "normal";
}

function voiceAiRecord(metadata: PhoneCallRow["metadata"]): Record<string, unknown> | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, unknown>).voice_ai;
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  return v as Record<string, unknown>;
}

/**
 * Follow-up hint column: AI spam suppresses; missed needs action; AI CRM suggestion can flag follow-up.
 */
export function getFollowUpStatus(call: Pick<PhoneCallRow, "status" | "metadata">): string {
  const ai = voiceAiRecord(call.metadata);
  const cat = typeof ai?.caller_category === "string" ? ai.caller_category.trim().toLowerCase() : "";
  if (cat === "spam") return "—";

  if (call.status.trim().toLowerCase() === "missed") return "⚠️ Needed";

  const crm = ai?.crm_suggestion;
  const crmRec =
    crm && typeof crm === "object" && !Array.isArray(crm) ? (crm as Record<string, unknown>) : null;
  const aiOutcome = typeof crmRec?.outcome === "string" ? crmRec.outcome.trim().toLowerCase() : "";
  if (aiOutcome === "needs_followup") return "Pending";

  return "—";
}

/** Missed calls first; within each bucket, newest first. */
export function sortCallsForOperationalView(calls: PhoneCallRow[]): PhoneCallRow[] {
  return [...calls].sort((a, b) => {
    const aMissed = a.status.trim().toLowerCase() === "missed";
    const bMissed = b.status.trim().toLowerCase() === "missed";

    if (aMissed && !bMissed) return -1;
    if (!aMissed && bMissed) return 1;

    const aTime = new Date(a.started_at || a.created_at).getTime();
    const bTime = new Date(b.started_at || b.created_at).getTime();
    const aOk = Number.isFinite(aTime) ? aTime : 0;
    const bOk = Number.isFinite(bTime) ? bTime : 0;
    return bOk - aOk;
  });
}
