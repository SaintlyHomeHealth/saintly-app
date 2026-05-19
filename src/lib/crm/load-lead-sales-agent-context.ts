import { supabaseAdmin } from "@/lib/admin";
import type { LeadDocumentAdminRow } from "@/app/admin/crm/leads/_components/LeadSalesAgentSection";

export type LeadSalesAgentAdminContext = {
  producedBySalesAgentId: string | null;
  producedByAgentName: string | null;
  ownershipLocked: boolean;
  assignedToStaffId: string;
  convertedToPatientAt: string | null;
  convertedPatientId: string | null;
  caregiverName: string;
  caregiverPhone: string;
  caregiverRelationship: string;
  reasonForReferral: string;
  insuranceMemberId: string;
  documents: LeadDocumentAdminRow[];
};

export async function loadLeadSalesAgentAdminContext(leadId: string): Promise<LeadSalesAgentAdminContext | null> {
  const { data: lead, error } = await supabaseAdmin
    .from("leads")
    .select(
      "produced_by_sales_agent_id, ownership_locked, assigned_to_staff_id, converted_to_patient_at, converted_patient_id, caregiver_name, caregiver_phone_number, caregiver_relationship, reason_for_referral, insurance_member_id"
    )
    .eq("id", leadId)
    .maybeSingle();

  if (error) {
    if (error.message.includes("produced_by_sales_agent_id") || error.code === "42703") {
      return null;
    }
    console.warn("[crm] loadLeadSalesAgentAdminContext:", error.message);
    return null;
  }

  const producedBySalesAgentId =
    typeof lead?.produced_by_sales_agent_id === "string" && lead.produced_by_sales_agent_id.trim()
      ? lead.produced_by_sales_agent_id.trim()
      : null;

  if (!producedBySalesAgentId) return null;

  let producedByAgentName: string | null = null;
  const { data: agentRow } = await supabaseAdmin
    .from("staff_profiles")
    .select("full_name, email")
    .eq("user_id", producedBySalesAgentId)
    .maybeSingle();
  producedByAgentName = (agentRow?.full_name ?? agentRow?.email ?? "").trim() || null;

  const { data: docs } = await supabaseAdmin
    .from("lead_documents")
    .select("id, document_type, created_at")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });

  return {
    producedBySalesAgentId,
    producedByAgentName,
    ownershipLocked: lead?.ownership_locked === true,
    assignedToStaffId:
      typeof lead?.assigned_to_staff_id === "string" && lead.assigned_to_staff_id.trim()
        ? lead.assigned_to_staff_id.trim()
        : "",
    convertedToPatientAt:
      typeof lead?.converted_to_patient_at === "string" ? lead.converted_to_patient_at : null,
    convertedPatientId:
      typeof lead?.converted_patient_id === "string" && lead.converted_patient_id.trim()
        ? lead.converted_patient_id.trim()
        : null,
    caregiverName: typeof lead?.caregiver_name === "string" ? lead.caregiver_name : "",
    caregiverPhone: typeof lead?.caregiver_phone_number === "string" ? lead.caregiver_phone_number : "",
    caregiverRelationship:
      typeof lead?.caregiver_relationship === "string" ? lead.caregiver_relationship : "",
    reasonForReferral: typeof lead?.reason_for_referral === "string" ? lead.reason_for_referral : "",
    insuranceMemberId: typeof lead?.insurance_member_id === "string" ? lead.insurance_member_id : "",
    documents: (docs ?? []) as LeadDocumentAdminRow[],
  };
}
