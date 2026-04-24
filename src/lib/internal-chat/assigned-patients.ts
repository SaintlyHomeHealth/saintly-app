import "server-only";

import { supabaseAdmin } from "@/lib/admin";

/**
 * Active, non-archived, non-test patients the staff member is actively assigned to.
 */
export async function fetchActiveAssignedPatientIdsForStaff(userId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("patient_assignments")
    .select("patient_id, patients ( patient_status, archived_at, is_test )")
    .eq("assigned_user_id", userId)
    .eq("is_active", true);

  if (error) {
    console.warn("[internal-chat] fetchActiveAssignedPatientIdsForStaff:", error.message);
    return new Set();
  }

  const out = new Set<string>();
  for (const row of data ?? []) {
    const p = row.patients as
      | { patient_status?: string | null; archived_at?: string | null; is_test?: boolean | null }
      | null
      | undefined;
    if (!p) continue;
    if (String(p.patient_status ?? "") !== "active") continue;
    if (p.archived_at) continue;
    if (p.is_test === true) continue;
    out.add(String(row.patient_id));
  }
  return out;
}

export async function assertStaffAssignedToAllPatients(
  staffUserId: string,
  patientIds: string[]
): Promise<boolean> {
  if (patientIds.length === 0) return true;
  const allowed = await fetchActiveAssignedPatientIdsForStaff(staffUserId);
  return patientIds.every((id) => allowed.has(id));
}
