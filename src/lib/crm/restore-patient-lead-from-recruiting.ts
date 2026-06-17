import type { SupabaseClient } from "@supabase/supabase-js";

import { resolveRestoredPatientLeadSource } from "@/lib/crm/crm-recruiting-lead-exclusion";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { hardDeleteRecruitingLead } from "@/lib/recruiting/hard-delete-recruiting-lead";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RecruitingLeadRestoreRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
  raw_payload: unknown;
  form_name?: string | null;
};

export type RestorePatientLeadFromRecruitingResult =
  | { ok: true; crmLeadId: string; contactId: string; recruitingLeadId: string; deletedRecruiting: boolean }
  | { ok: false; error: string; status: 400 | 404 | 409 | 500 };

function splitFullName(fullName: string): { first_name: string | null; last_name: string | null } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first_name: null, last_name: null };
  if (parts.length === 1) return { first_name: parts[0], last_name: null };
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") };
}

function latestPayload(rawPayload: unknown): Record<string, unknown> | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const root = rawPayload as { latest?: unknown };
  return root.latest && typeof root.latest === "object" && !Array.isArray(root.latest)
    ? (root.latest as Record<string, unknown>)
    : null;
}

function resolveOriginalCrmSource(row: RecruitingLeadRestoreRow): string | null {
  const latest = latestPayload(row.raw_payload);
  const fromLatest = latest?.original_crm_source;
  if (typeof fromLatest === "string" && fromLatest.trim()) {
    return fromLatest.trim();
  }
  return null;
}

function buildRestoreNotes(row: RecruitingLeadRestoreRow): string | null {
  const lines = [
    row.notes?.trim() || null,
    row.form_name?.trim() ? `Original recruiting form: ${row.form_name.trim()}` : null,
    "Restored from Recruiting Leads (misclassified patient lead).",
  ].filter(Boolean);
  return lines.length > 0 ? lines.join("\n\n").slice(0, 8000) : null;
}

async function findExistingRestoredLeadId(
  supabase: SupabaseClient,
  recruitingLeadId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("external_source_metadata->>original_recruiting_lead_id", recruitingLeadId)
    .is("deleted_at", null)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

export async function restorePatientLeadFromRecruiting(
  supabase: SupabaseClient,
  recruitingLeadIdRaw: string,
  options?: { restoredReason?: string; skipNotifications?: boolean }
): Promise<RestorePatientLeadFromRecruitingResult> {
  const recruitingLeadId = recruitingLeadIdRaw.trim();
  if (!UUID_RE.test(recruitingLeadId)) {
    return { ok: false, error: "invalid_recruiting_lead_id", status: 400 };
  }

  const existingCrmLeadId = await findExistingRestoredLeadId(supabase, recruitingLeadId);
  if (existingCrmLeadId) {
    return { ok: false, error: "already_restored", status: 409 };
  }

  const { data: row, error: loadErr } = await supabase
    .from("facebook_recruiting_leads")
    .select("id, full_name, phone, email, city, source, notes, created_at, raw_payload, form_name")
    .eq("id", recruitingLeadId)
    .maybeSingle();

  if (loadErr) {
    console.warn("[restore-patient-lead] load recruiting lead:", loadErr.message);
    return { ok: false, error: loadErr.message, status: 500 };
  }
  if (!row?.id) {
    return { ok: false, error: "recruiting_lead_not_found", status: 404 };
  }

  const recruitingLead = row as RecruitingLeadRestoreRow;
  const fullName = recruitingLead.full_name?.trim() || "Unknown patient lead";
  const { first_name, last_name } = splitFullName(fullName);
  const originalCrmSource = resolveOriginalCrmSource(recruitingLead);
  const restoredSource = resolveRestoredPatientLeadSource({
    recruitingSource: recruitingLead.source,
  });
  const leadSource = restoredSource;

  const phoneDigits = normalizePhone(recruitingLead.phone);
  const primaryPhone = phoneDigits.length >= 10 ? recruitingLead.phone?.trim() || phoneDigits : null;

  const { data: contactRow, error: contactErr } = await supabase
    .from("contacts")
    .insert({
      full_name: fullName,
      first_name,
      last_name,
      primary_phone: primaryPhone,
      email: recruitingLead.email?.trim() || null,
      city: recruitingLead.city?.trim() || null,
    })
    .select("id")
    .single();

  if (contactErr || !contactRow?.id) {
    console.warn("[restore-patient-lead] contact insert:", contactErr?.message);
    return { ok: false, error: contactErr?.message ?? "contact_insert_failed", status: 500 };
  }

  const contactId = String(contactRow.id);
  const restoredReason = options?.restoredReason?.trim() || "misclassified_patient_lead";
  const externalMeta: Record<string, unknown> = {
    restored_from_recruiting: true,
    original_recruiting_lead_id: recruitingLeadId,
    restored_reason: restoredReason,
    restored_at: new Date().toISOString(),
    restored_source: restoredSource,
    original_recruiting_source: recruitingLead.source ?? null,
    original_crm_source: originalCrmSource,
    recruiting_raw_payload: recruitingLead.raw_payload ?? null,
  };

  const { data: leadRow, error: leadErr } = await supabase
    .from("leads")
    .insert({
      contact_id: contactId,
      source: leadSource,
      status: "new",
      lead_type: null,
      notes: buildRestoreNotes(recruitingLead),
      created_at: recruitingLead.created_at,
      external_source_metadata: externalMeta,
    })
    .select("id")
    .single();

  if (leadErr || !leadRow?.id) {
    console.warn("[restore-patient-lead] lead insert:", leadErr?.message);
    await supabase.from("contacts").delete().eq("id", contactId);
    return { ok: false, error: leadErr?.message ?? "lead_insert_failed", status: 500 };
  }

  const crmLeadId = String(leadRow.id);

  if (!options?.skipNotifications) {
    const { handleNewLeadCreated } = await import("@/lib/crm/post-create-lead-workflow");
    await handleNewLeadCreated(supabase, {
      leadId: crmLeadId,
      contactId,
      intakeChannel: "other",
    });
  }

  const deleteResult = await hardDeleteRecruitingLead(supabase, recruitingLeadId);
  if (!deleteResult.ok) {
    console.warn("[restore-patient-lead] recruiting delete failed after CRM restore:", deleteResult.error);
    return { ok: false, error: `crm_created_but_recruiting_delete_failed:${deleteResult.error}`, status: 500 };
  }

  return {
    ok: true,
    crmLeadId,
    contactId,
    recruitingLeadId,
    deletedRecruiting: true,
  };
}
