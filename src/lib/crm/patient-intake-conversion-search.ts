import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveAdminCrmLeadsKeywordLeadSearchOr } from "@/lib/crm/admin-crm-leads-keyword-search";
import { buildContactSearchOrClauseMulti, escapeForIlike } from "@/lib/crm/crm-leads-search";
import { contactDisplayName, normalizeContact } from "@/lib/crm/crm-leads-table-helpers";
import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import {
  leadDisplayPrimaryPayerName,
  leadDisplayPrimaryPayerTypeLine,
} from "@/lib/crm/lead-payer-structured";
import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";
import { formatLeadPipelineStatusLabel } from "@/lib/crm/lead-pipeline-status";
import { normalizeCrmStage } from "@/lib/crm/crm-stage";
import { isLeadPipelineTerminal } from "@/lib/crm/lead-pipeline-status";
import { isMissingSchemaObjectError } from "@/lib/crm/supabase-migration-fallback";

export type PatientIntakeSearchResult = {
  leadId: string;
  contactId: string;
  patientId: string | null;
  displayName: string;
  primaryPhone: string | null;
  secondaryPhone: string | null;
  payerName: string | null;
  payerType: string | null;
  disciplines: string[];
  referralSource: string | null;
  sourceLabel: string;
  statusLabel: string;
  crmStage: string;
  canConvert: boolean;
  isExistingPatient: boolean;
};

const LEAD_SELECT = `
  id,
  contact_id,
  source,
  status,
  crm_stage,
  converted_patient_id,
  payer_name,
  payer_type,
  primary_payer_name,
  primary_payer_type,
  referral_source,
  service_disciplines,
  service_type,
  medicare_number,
  created_at,
  contacts (
    id,
    full_name,
    first_name,
    last_name,
    primary_phone,
    secondary_phone,
    date_of_birth
  )
`;

function normalizeDisciplines(raw: unknown, serviceType: string | null): string[] {
  if (Array.isArray(raw)) {
    const list = raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
    if (list.length > 0) return list;
  }
  const legacy = (serviceType ?? "").trim();
  if (legacy) return legacy.split(",").map((s) => s.trim()).filter(Boolean);
  return [];
}

async function resolvePatientIdsByContact(
  supabase: SupabaseClient,
  contactIds: string[]
): Promise<Map<string, string>> {
  if (contactIds.length === 0) return new Map();
  const { data, error } = await supabase.from("patients").select("id, contact_id").in("contact_id", contactIds);
  if (error) {
    console.warn("[crm/patient-intake-search] patients by contact:", error.message);
    return new Map();
  }
  const map = new Map<string, string>();
  for (const row of data ?? []) {
    const cid = String((row as { contact_id?: unknown }).contact_id ?? "").trim();
    const pid = String((row as { id?: unknown }).id ?? "").trim();
    if (cid && pid) map.set(cid, pid);
  }
  return map;
}

function buildLeadMedicareOrClause(searchTerms: readonly string[]): string | null {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const t of searchTerms) {
    const esc = escapeForIlike(t.trim());
    if (!esc) continue;
    const frag = `medicare_number.ilike.%${esc}%`;
    if (seen.has(frag)) continue;
    seen.add(frag);
    parts.push(frag);
  }
  return parts.length > 0 ? parts.join(",") : null;
}

export async function searchIntakeRecordsForPatientConversion(
  supabase: SupabaseClient,
  qRaw: string
): Promise<PatientIntakeSearchResult[]> {
  const q = qRaw.trim().slice(0, 120);
  if (q.length < 2) return [];

  const leadOr = await resolveAdminCrmLeadsKeywordLeadSearchOr(supabase, q);
  const medicareOr = buildLeadMedicareOrClause([q]);

  let leadQuery = leadRowsActiveOnly(
    supabase.from("leads").select(LEAD_SELECT).order("created_at", { ascending: false }).limit(30)
  );

  const orParts = [leadOr, medicareOr].filter(Boolean) as string[];
  if (orParts.length > 0) {
    leadQuery = leadQuery.or(orParts.join(","));
  } else {
    return [];
  }

  const { data: leadRows, error: leadErr } = await leadQuery;
  if (leadErr) {
    if (!isMissingSchemaObjectError(leadErr)) {
      console.warn("[crm/patient-intake-search] leads:", leadErr.message);
    }
    return [];
  }

  const leads = (leadRows ?? []) as Record<string, unknown>[];
  const contactIds = [...new Set(leads.map((r) => String(r.contact_id ?? "").trim()).filter(Boolean))];
  const patientByContact = await resolvePatientIdsByContact(supabase, contactIds);

  const results: PatientIntakeSearchResult[] = [];
  const seenLeadIds = new Set<string>();

  for (const row of leads) {
    const leadId = String(row.id ?? "").trim();
    if (!leadId || seenLeadIds.has(leadId)) continue;
    seenLeadIds.add(leadId);

    const contactId = String(row.contact_id ?? "").trim();
    const contact = normalizeContact(row.contacts as Parameters<typeof normalizeContact>[0]);
    const convertedPatientId =
      typeof row.converted_patient_id === "string" && row.converted_patient_id.trim()
        ? row.converted_patient_id.trim()
        : null;
    const patientFromContact = contactId ? patientByContact.get(contactId) ?? null : null;
    const patientId = convertedPatientId ?? patientFromContact;

    const crmStage = normalizeCrmStage(typeof row.crm_stage === "string" ? row.crm_stage : null);
    const status = typeof row.status === "string" ? row.status : null;
    const terminal = isLeadPipelineTerminal(status);
    const isExistingPatient = Boolean(patientId) || crmStage === "patient";
    const canConvert = !terminal && !isExistingPatient;

    const payerName =
      leadDisplayPrimaryPayerName({
        primary_payer_name: String(row.primary_payer_name ?? ""),
        payer_name: String(row.payer_name ?? ""),
      }) || null;
    const payerType =
      leadDisplayPrimaryPayerTypeLine({
        primary_payer_type: String(row.primary_payer_type ?? ""),
        payer_type: String(row.payer_type ?? ""),
      }) || null;

    results.push({
      leadId,
      contactId,
      patientId,
      displayName: contactDisplayName(contact),
      primaryPhone: (contact?.primary_phone as string | null | undefined) ?? null,
      secondaryPhone: (contact?.secondary_phone as string | null | undefined) ?? null,
      payerName,
      payerType,
      disciplines: normalizeDisciplines(row.service_disciplines, typeof row.service_type === "string" ? row.service_type : null),
      referralSource: typeof row.referral_source === "string" ? row.referral_source.trim() || null : null,
      sourceLabel: formatLeadSourceLabel(typeof row.source === "string" ? row.source : ""),
      statusLabel: formatLeadPipelineStatusLabel(status),
      crmStage,
      canConvert,
      isExistingPatient,
    });
  }

  // Contacts with patients but no matching lead in bucket — surface existing patient charts.
  const contactOr = buildContactSearchOrClauseMulti([q]);
  if (contactOr && results.length < 20) {
    const { data: contactHits } = await contactRowsActiveOnly(
      supabase
        .from("contacts")
        .select("id, full_name, first_name, last_name, primary_phone, secondary_phone")
        .or(contactOr)
        .limit(15)
    );
    const extraContactIds = (contactHits ?? [])
      .map((c) => String((c as { id?: unknown }).id ?? "").trim())
      .filter((id) => id && !contactIds.includes(id));
    if (extraContactIds.length > 0) {
      const extraPatients = await resolvePatientIdsByContact(supabase, extraContactIds);
      for (const c of contactHits ?? []) {
        const cid = String((c as { id?: unknown }).id ?? "").trim();
        const pid = extraPatients.get(cid);
        if (!pid || contactIds.includes(cid)) continue;
        const contact = normalizeContact(c as Parameters<typeof normalizeContact>[0]);
        results.push({
          leadId: "",
          contactId: cid,
          patientId: pid,
          displayName: contactDisplayName(contact),
          primaryPhone: (contact?.primary_phone as string | null | undefined) ?? null,
          secondaryPhone: (contact?.secondary_phone as string | null | undefined) ?? null,
          payerName: null,
          payerType: null,
          disciplines: [],
          referralSource: null,
          sourceLabel: "Existing patient",
          statusLabel: "Patient chart",
          crmStage: "patient",
          canConvert: false,
          isExistingPatient: true,
        });
      }
    }
  }

  return results.slice(0, 25);
}
