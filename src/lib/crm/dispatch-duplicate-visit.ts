import { supabaseAdmin } from "@/lib/admin";

/**
 * Find an existing open (scheduled/confirmed) visit that matches the same patient,
 * same instant start, same window end (or both null), and same assignee (including null).
 * Used to block accidental double-submit duplicates.
 */
export async function findOpenDuplicatePatientVisitId(params: {
  patientId: string;
  scheduledForIso: string;
  scheduledEndAtIso: string | null;
  assignedUserId: string | null;
}): Promise<string | null> {
  let q = supabaseAdmin
    .from("patient_visits")
    .select("id")
    .eq("patient_id", params.patientId)
    .in("status", ["scheduled", "confirmed"])
    .eq("scheduled_for", params.scheduledForIso)
    .limit(1);

  if (params.scheduledEndAtIso) {
    q = q.eq("scheduled_end_at", params.scheduledEndAtIso);
  } else {
    q = q.is("scheduled_end_at", null);
  }

  if (params.assignedUserId) {
    q = q.eq("assigned_user_id", params.assignedUserId);
  } else {
    q = q.is("assigned_user_id", null);
  }

  const { data, error } = await q;
  if (error) {
    console.warn("[dispatch-duplicate-visit] query", error.message);
    return null;
  }
  const id = data?.[0]?.id;
  return typeof id === "string" ? id : null;
}
