"use server";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { insertAuditLog } from "@/lib/audit-log";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";
import { syncOnboardingProgressForApplicant } from "@/lib/onboarding/sync-progress";

export async function recomputeOnboardingForEmployeeAction(
  applicantId: string
): Promise<{ ok: true; message: string } | { ok: false; message: string }> {
  const trimmed = (applicantId || "").trim();
  if (!trimmed) {
    return { ok: false, message: "Missing employee id." };
  }

  const profile = await getStaffProfile();
  if (!isAdminOrHigher(profile)) {
    return { ok: false, message: "Only administrators can recompute onboarding status." };
  }

  const result = await syncOnboardingProgressForApplicant(supabaseAdmin, trimmed, {
    sessionStarted: true,
  });

  if (!result.ok) {
    return { ok: false, message: `Could not recompute: ${result.error}` };
  }

  await insertAuditLog({
    action: "onboarding_recompute",
    entityType: "applicant",
    entityId: trimmed,
    metadata: { staff_id: profile?.id ?? null },
  });

  revalidatePath("/admin/employees");
  revalidatePath(`/admin/employees/${trimmed}`);

  return { ok: true, message: "Recomputed. Progress columns in onboarding_status were updated from current artifacts." };
}
