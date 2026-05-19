"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { appendLeadActivityRow } from "@/lib/crm/append-lead-activity";
import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";
import { handleNewLeadCreated } from "@/lib/crm/post-create-lead-workflow";
import {
  isAllowedLeadDocumentMime,
  isValidLeadDocumentType,
  leadDocumentStoragePath,
  LEAD_DOCUMENTS_BUCKET,
  LEAD_DOCUMENTS_MAX_BYTES,
  type LeadDocumentType,
} from "@/lib/crm/lead-documents-storage";
import {
  legacyBroadPayerCategoryFromStructured,
  legacyPayerNameFromStructured,
} from "@/lib/crm/lead-payer-structured";
import { parseServiceDisciplinesFromFormData } from "@/lib/crm/service-disciplines";
import { requireSalesAgent } from "@/lib/sales-agent/sales-agent-auth";
import {
  SALES_AGENT_ORDERS_BASE,
  SALES_AGENT_ORDERS_NEW,
  salesAgentLeadDetailPath,
} from "@/lib/sales-agent/sales-agent-workspace-paths";
import {
  findSalesAgentDuplicateLeads,
  type SalesAgentDuplicateHit,
} from "@/lib/sales-agent/sales-agent-lead-duplicate-check";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { normalizeSsnDigits } from "@/lib/crm/ssn-mask";

function readTrimmed(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v.trim() : "";
}

function readCheckbox(formData: FormData, key: string): boolean {
  const v = formData.get(key);
  return v === "on" || v === "true" || v === "1";
}

function parseDobIso(raw: string): string | null {
  const t = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

function mapInsuranceTypeToStructured(type: string): string | null {
  const t = type.trim().toLowerCase();
  switch (t) {
    case "medicare":
      return "original_medicare";
    case "medicare advantage":
      return "medicare_advantage";
    case "ahcccs":
      return "medicaid";
    case "commercial":
      return "commercial";
    case "other":
      return "other";
    default:
      return null;
  }
}

function parseAddressLine(address: string): {
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
} {
  const raw = address.trim();
  if (!raw) {
    return { address_line_1: null, city: null, state: null, zip: null };
  }
  return { address_line_1: raw, city: null, state: null, zip: null };
}

function agentDisplayName(staff: { full_name: string | null; email: string | null }): string {
  return (staff.full_name ?? staff.email ?? "Sales Agent").trim() || "Sales Agent";
}

async function uploadLeadDocumentFromForm(
  formData: FormData,
  leadId: string,
  fieldName: string,
  documentType: LeadDocumentType,
  uploadedBy: string
): Promise<void> {
  const fileEntry = formData.get(fieldName);
  if (!(fileEntry instanceof File) || fileEntry.size < 1) return;

  if (fileEntry.size > LEAD_DOCUMENTS_MAX_BYTES) {
    console.warn("[sales-agent] document too large:", fieldName);
    return;
  }

  const mime = fileEntry.type || "application/octet-stream";
  if (!isAllowedLeadDocumentMime(mime)) {
    console.warn("[sales-agent] disallowed mime for upload");
    return;
  }

  const docId = crypto.randomUUID();
  const path = leadDocumentStoragePath(leadId, docId, fileEntry.name || "card.jpg");
  const buffer = Buffer.from(await fileEntry.arrayBuffer());

  const { error: upErr } = await supabaseAdmin.storage.from(LEAD_DOCUMENTS_BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (upErr) {
    console.warn("[sales-agent] storage upload failed");
    return;
  }

  const { error: insErr } = await supabaseAdmin.from("lead_documents").insert({
    id: docId,
    lead_id: leadId,
    document_type: documentType,
    storage_bucket: LEAD_DOCUMENTS_BUCKET,
    storage_path: path,
    uploaded_by: uploadedBy,
  });

  if (insErr) {
    console.warn("[sales-agent] lead_documents insert failed");
    await supabaseAdmin.storage.from(LEAD_DOCUMENTS_BUCKET).remove([path]);
  }
}

export async function checkSalesAgentLeadDuplicates(formData: FormData): Promise<SalesAgentDuplicateHit[]> {
  await requireSalesAgent();

  const phoneRaw = readTrimmed(formData, "phone_number");
  const primary_phone = normalizePhone(phoneRaw);
  if (!primary_phone) return [];

  const dob = parseDobIso(readTrimmed(formData, "date_of_birth"));
  const medicare_number = readTrimmed(formData, "medicare_number") || null;
  const patientName = readTrimmed(formData, "patient_name") || null;

  return findSalesAgentDuplicateLeads({
    phoneE164: primary_phone,
    medicareNumber: medicare_number,
    patientName,
    dobIso: dob,
  });
}

export async function createSalesAgentLead(formData: FormData) {
  const staff = await requireSalesAgent();

  const patientName = readTrimmed(formData, "patient_name");
  const phoneRaw = readTrimmed(formData, "phone_number");
  const addressRaw = readTrimmed(formData, "address");
  const dobRaw = readTrimmed(formData, "date_of_birth");
  const insuranceTypeRaw = readTrimmed(formData, "insurance_type");
  const insuranceNameRaw = readTrimmed(formData, "insurance_name");
  const consent = readCheckbox(formData, "consent_to_contact");
  const confirmDuplicate = readCheckbox(formData, "confirm_duplicate");

  if (!patientName) redirect(`${SALES_AGENT_ORDERS_NEW}?error=validation_name`);
  if (!addressRaw) redirect(`${SALES_AGENT_ORDERS_NEW}?error=validation_address`);
  if (!phoneRaw) redirect(`${SALES_AGENT_ORDERS_NEW}?error=validation_phone`);
  if (!consent) redirect(`${SALES_AGENT_ORDERS_NEW}?error=validation_consent`);

  const primary_phone = normalizePhone(phoneRaw);
  if (!primary_phone) redirect(`${SALES_AGENT_ORDERS_NEW}?error=validation_phone`);

  const dob = parseDobIso(dobRaw);
  if (!dob) redirect(`${SALES_AGENT_ORDERS_NEW}?error=validation_dob`);

  if (!insuranceTypeRaw && !insuranceNameRaw) {
    redirect(`${SALES_AGENT_ORDERS_NEW}?error=validation_insurance`);
  }

  if (!confirmDuplicate) {
    const duplicates = await findSalesAgentDuplicateLeads({
      phoneE164: primary_phone,
      medicareNumber: readTrimmed(formData, "medicare_number") || null,
      patientName,
      dobIso: dob,
    });
    if (duplicates.length > 0) {
      redirect(`${SALES_AGENT_ORDERS_NEW}?error=duplicate_found`);
    }
  }

  const addr = parseAddressLine(addressRaw);
  const primary_payer_type = mapInsuranceTypeToStructured(insuranceTypeRaw);
  const insurance_name = insuranceNameRaw || null;
  const primary_payer_name = insurance_name;
  const payer_name = legacyPayerNameFromStructured(primary_payer_name, null);
  const payer_type = legacyBroadPayerCategoryFromStructured(primary_payer_type);

  const disciplines = parseServiceDisciplinesFromFormData(formData, "services_requested");
  const medicare_number = readTrimmed(formData, "medicare_number") || null;
  const ssnRaw = readTrimmed(formData, "social_security_number");
  const social_security_number = ssnRaw ? normalizeSsnDigits(ssnRaw) : null;
  if (ssnRaw && !social_security_number) {
    redirect(`${SALES_AGENT_ORDERS_NEW}?error=validation_ssn`);
  }

  const { data: contactRow, error: cErr } = await supabaseAdmin
    .from("contacts")
    .insert({
      full_name: patientName,
      primary_phone,
      email: readTrimmed(formData, "email") || null,
      ...addr,
    })
    .select("id")
    .single();

  if (cErr || !contactRow?.id) {
    console.warn("[sales-agent] contact insert failed");
    redirect(`${SALES_AGENT_ORDERS_NEW}?error=contact_failed`);
  }

  const contactId = contactRow.id as string;

  const { data: leadRow, error: lErr } = await supabaseAdmin
    .from("leads")
    .insert({
      contact_id: contactId,
      source: "sales_agent",
      status: "new_lead",
      produced_by_sales_agent_id: staff.user_id,
      produced_by_source: "sales_agent_order",
      ownership_locked: true,
      consent_to_contact: true,
      dob,
      medicare_number,
      insurance_name,
      insurance_type: insuranceTypeRaw || null,
      insurance_member_id: readTrimmed(formData, "insurance_member_id") || null,
      primary_payer_type,
      primary_payer_name,
      payer_name,
      payer_type,
      caregiver_name: readTrimmed(formData, "caregiver_name") || null,
      caregiver_phone_number: normalizePhone(readTrimmed(formData, "caregiver_phone_number")) || null,
      caregiver_relationship: readTrimmed(formData, "caregiver_relationship") || null,
      referring_doctor_name: readTrimmed(formData, "doctor_or_pcp_name") || null,
      doctor_office_name: readTrimmed(formData, "facility_or_hospital_name") || null,
      reason_for_referral: readTrimmed(formData, "reason_for_referral") || null,
      service_disciplines: disciplines,
      service_type: disciplines.length > 0 ? disciplines.join(", ") : null,
      notes: readTrimmed(formData, "notes") || null,
      social_security_number,
    })
    .select("id")
    .single();

  if (lErr || !leadRow?.id) {
    console.warn("[sales-agent] lead insert failed");
    await supabaseAdmin.from("contacts").delete().eq("id", contactId);
    redirect(`${SALES_AGENT_ORDERS_NEW}?error=lead_failed`);
  }

  const leadId = leadRow.id as string;

  await Promise.all([
    uploadLeadDocumentFromForm(formData, leadId, "medicare_card_front", "medicare_card_front", staff.user_id),
    uploadLeadDocumentFromForm(formData, leadId, "medicare_card_back", "medicare_card_back", staff.user_id),
    uploadLeadDocumentFromForm(formData, leadId, "insurance_card_front", "insurance_card_front", staff.user_id),
    uploadLeadDocumentFromForm(formData, leadId, "insurance_card_back", "insurance_card_back", staff.user_id),
  ]);

  const agentName = agentDisplayName(staff);
  await appendLeadActivityRow({
    leadId,
    eventType: LEAD_ACTIVITY_EVENT.sales_agent_submitted,
    body: `Lead submitted by Sales Agent: ${agentName}.`,
    metadata: { produced_by_sales_agent_id: staff.user_id, source: "sales_agent" },
    createdByUserId: staff.user_id,
  });

  await handleNewLeadCreated(supabaseAdmin, {
    leadId,
    contactId,
    intakeChannel: "sales_agent",
  });

  revalidatePath(SALES_AGENT_ORDERS_BASE);
  revalidatePath("/admin/crm/leads");
  redirect(`${salesAgentLeadDetailPath(leadId)}?created=1`);
}

export async function uploadSalesAgentLeadDocument(formData: FormData) {
  const staff = await requireSalesAgent();

  const leadId = readTrimmed(formData, "leadId");
  const docTypeRaw = readTrimmed(formData, "documentType");
  if (!leadId || !isValidLeadDocumentType(docTypeRaw)) {
    redirect(`${SALES_AGENT_ORDERS_BASE}?error=invalid_upload`);
  }

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, produced_by_sales_agent_id, ownership_locked")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lead?.id || lead.produced_by_sales_agent_id !== staff.user_id) {
    redirect(`${SALES_AGENT_ORDERS_BASE}?error=forbidden`);
  }

  await uploadLeadDocumentFromForm(formData, leadId, "file", docTypeRaw, staff.user_id);

  revalidatePath(salesAgentLeadDetailPath(leadId));
  revalidatePath(`/admin/crm/leads/${leadId}`);
  redirect(`${salesAgentLeadDetailPath(leadId)}?uploaded=1`);
}

/** Hide lead from the sales agent Orders list only — admin CRM lead is unchanged. */
export async function hideSalesAgentLeadFromList(formData: FormData) {
  const staff = await requireSalesAgent();
  const leadId = readTrimmed(formData, "leadId");
  if (!leadId) {
    redirect(`${SALES_AGENT_ORDERS_BASE}?error=invalid`);
  }

  const { data: lead } = await supabaseAdmin
    .from("leads")
    .select("id, produced_by_sales_agent_id")
    .eq("id", leadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!lead?.id || lead.produced_by_sales_agent_id !== staff.user_id) {
    redirect(`${SALES_AGENT_ORDERS_BASE}?error=forbidden`);
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("leads")
    .update({
      sales_agent_hidden_at: now,
      sales_agent_hidden_by: staff.user_id,
      updated_at: now,
    })
    .eq("id", leadId)
    .eq("produced_by_sales_agent_id", staff.user_id);

  if (error) {
    console.warn("[sales-agent] hide from list failed");
    redirect(`${salesAgentLeadDetailPath(leadId)}?error=hide_failed`);
  }

  revalidatePath(SALES_AGENT_ORDERS_BASE);
  revalidatePath(salesAgentLeadDetailPath(leadId));
  revalidatePath(`/admin/crm/leads/${leadId}`);
  redirect(`${SALES_AGENT_ORDERS_BASE}?removed=1`);
}
