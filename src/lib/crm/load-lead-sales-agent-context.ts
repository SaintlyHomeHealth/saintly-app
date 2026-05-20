import { supabaseAdmin } from "@/lib/admin";
import type { LeadDocumentAdminRow } from "@/app/admin/crm/leads/_components/LeadSalesAgentSection";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";
import { isValidCrmLeadId } from "@/lib/crm/crm-lead-id";

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
  socialSecurityNumber: string;
  salesAgentHiddenAt: string | null;
  documents: LeadDocumentAdminRow[];
  /** When true, documents query failed — UI can show "Documents unavailable". */
  documentsUnavailable?: boolean;
};

const SALES_AGENT_COLUMNS_FULL =
  "produced_by_sales_agent_id, ownership_locked, assigned_to_staff_id, converted_to_patient_at, converted_patient_id, caregiver_name, caregiver_phone_number, caregiver_relationship, reason_for_referral, insurance_member_id, social_security_number, sales_agent_hidden_at";

const SALES_AGENT_COLUMNS_NO_SSN =
  "produced_by_sales_agent_id, ownership_locked, assigned_to_staff_id, converted_to_patient_at, converted_patient_id, caregiver_name, caregiver_phone_number, caregiver_relationship, reason_for_referral, insurance_member_id, sales_agent_hidden_at";

const SALES_AGENT_COLUMNS_MINIMAL =
  "produced_by_sales_agent_id, ownership_locked, assigned_to_staff_id";

function mapLeadRowToContext(
  lead: Record<string, unknown>,
  producedByAgentName: string | null,
  documents: LeadDocumentAdminRow[],
  documentsUnavailable: boolean
): LeadSalesAgentAdminContext {
  const producedBySalesAgentId =
    typeof lead.produced_by_sales_agent_id === "string" && lead.produced_by_sales_agent_id.trim()
      ? lead.produced_by_sales_agent_id.trim()
      : null;

  return {
    producedBySalesAgentId,
    producedByAgentName,
    ownershipLocked: lead.ownership_locked === true,
    assignedToStaffId:
      typeof lead.assigned_to_staff_id === "string" && lead.assigned_to_staff_id.trim()
        ? lead.assigned_to_staff_id.trim()
        : "",
    convertedToPatientAt:
      typeof lead.converted_to_patient_at === "string" ? lead.converted_to_patient_at : null,
    convertedPatientId:
      typeof lead.converted_patient_id === "string" && lead.converted_patient_id.trim()
        ? lead.converted_patient_id.trim()
        : null,
    caregiverName: typeof lead.caregiver_name === "string" ? lead.caregiver_name : "",
    caregiverPhone: typeof lead.caregiver_phone_number === "string" ? lead.caregiver_phone_number : "",
    caregiverRelationship:
      typeof lead.caregiver_relationship === "string" ? lead.caregiver_relationship : "",
    reasonForReferral: typeof lead.reason_for_referral === "string" ? lead.reason_for_referral : "",
    insuranceMemberId: typeof lead.insurance_member_id === "string" ? lead.insurance_member_id : "",
    socialSecurityNumber:
      typeof lead.social_security_number === "string" ? lead.social_security_number : "",
    salesAgentHiddenAt:
      typeof lead.sales_agent_hidden_at === "string" ? lead.sales_agent_hidden_at : null,
    documents,
    documentsUnavailable,
  };
}

/** Minimal context when extended columns are unavailable but the lead is a sales-agent order. */
export function buildMinimalLeadSalesAgentAdminContext(input: {
  producedBySalesAgentId: string;
  producedByAgentName?: string | null;
  ownershipLocked?: boolean;
  assignedToStaffId?: string;
}): LeadSalesAgentAdminContext {
  return mapLeadRowToContext(
    {
      produced_by_sales_agent_id: input.producedBySalesAgentId,
      ownership_locked: input.ownershipLocked === true,
      assigned_to_staff_id: input.assignedToStaffId ?? "",
    },
    input.producedByAgentName ?? null,
    [],
    false
  );
}

async function loadLeadSalesAgentRow(
  leadId: string
): Promise<{ lead: Record<string, unknown> | null; salesAgentWorkflowAvailable: boolean }> {
  const attempts = [SALES_AGENT_COLUMNS_FULL, SALES_AGENT_COLUMNS_NO_SSN, SALES_AGENT_COLUMNS_MINIMAL];

  for (const select of attempts) {
    const { data, error } = await supabaseAdmin.from("leads").select(select).eq("id", leadId).maybeSingle();
    if (!error && data) {
      return { lead: data as Record<string, unknown>, salesAgentWorkflowAvailable: true };
    }
    if (error && isMissingSchemaObjectError(error)) {
      continue;
    }
    if (error?.message.includes("produced_by_sales_agent_id") || error?.code === "42703") {
      return { lead: null, salesAgentWorkflowAvailable: false };
    }
    if (error) {
      console.warn("[crm] loadLeadSalesAgentAdminContext lead row:", error.message);
      return { lead: null, salesAgentWorkflowAvailable: true };
    }
  }

  return { lead: null, salesAgentWorkflowAvailable: false };
}

export async function loadLeadSalesAgentAdminContext(leadId: string): Promise<LeadSalesAgentAdminContext | null> {
  const id = leadId.trim();
  if (!isValidCrmLeadId(id)) return null;

  const { lead, salesAgentWorkflowAvailable } = await loadLeadSalesAgentRow(id);
  if (!salesAgentWorkflowAvailable || !lead) return null;

  const producedBySalesAgentId =
    typeof lead.produced_by_sales_agent_id === "string" && lead.produced_by_sales_agent_id.trim()
      ? lead.produced_by_sales_agent_id.trim()
      : null;

  if (!producedBySalesAgentId) return null;

  let producedByAgentName: string | null = null;
  try {
    const { data: agentRow } = await supabaseAdmin
      .from("staff_profiles")
      .select("full_name, email")
      .eq("user_id", producedBySalesAgentId)
      .maybeSingle();
    producedByAgentName = (agentRow?.full_name ?? agentRow?.email ?? "").trim() || null;
  } catch (e) {
    console.warn("[crm] loadLeadSalesAgentAdminContext staff lookup:", e);
  }

  let documents: LeadDocumentAdminRow[] = [];
  let documentsUnavailable = false;
  const { data: docs, error: docsErr } = await supabaseAdmin
    .from("lead_documents")
    .select("id, document_type, created_at")
    .eq("lead_id", id)
    .order("created_at", { ascending: true });
  if (docsErr) {
    if (!isMissingSchemaObjectError(docsErr)) {
      console.warn("[crm] loadLeadSalesAgentAdminContext documents:", docsErr.message);
    }
    documentsUnavailable = true;
  } else {
    documents = (docs ?? []) as LeadDocumentAdminRow[];
  }

  return mapLeadRowToContext(lead, producedByAgentName, documents, documentsUnavailable);
}
