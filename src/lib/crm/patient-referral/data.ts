import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";

import type { PatientFileListRow, PatientReferralListRow } from "@/lib/crm/patient-referral/types";

export async function loadPatientReferralsForChart(patientId: string): Promise<{
  referrals: PatientReferralListRow[];
  files: PatientFileListRow[];
}> {
  const [refRes, fileRes] = await Promise.all([
    supabaseAdmin
      .from("patient_referrals")
      .select(
        "id, referral_source_type, referral_facility, received_date, requested_soc_date, insurance_name, authorization_number, sn_visits, pt_visits, ot_visits, st_visits, msw_visits, hha_visits, intake_status, chief_complaint, notes, created_at"
      )
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("patient_files")
      .select("id, file_name, file_path, document_type, referral_source_type, patient_id, referral_id, created_at")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (refRes.error && !isMissingSchemaObjectError(refRes.error)) {
    console.warn("[patient-referral] load referrals:", refRes.error.message);
  }
  if (fileRes.error && !isMissingSchemaObjectError(fileRes.error)) {
    console.warn("[patient-referral] load files:", fileRes.error.message);
  }

  return {
    referrals: (refRes.data ?? []) as PatientReferralListRow[],
    files: (fileRes.data ?? []) as PatientFileListRow[],
  };
}
