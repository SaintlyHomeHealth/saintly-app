import type { SupabaseClient } from "@supabase/supabase-js";

import { parseEmploymentApplicationMeta } from "@/lib/crm/lead-employment-meta";
import {
  normalizeRecruitingEmail,
  normalizeRecruitingPhoneForStorage,
} from "@/lib/recruiting/recruiting-contact-normalize";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LEGACY_CRM_SOURCE = "legacy_crm_lead";
const LEGACY_CRM_FORM_NAME = "Legacy CRM recruiting lead";

type CrmLeadRow = {
  id: string;
  contact_id: string;
  source: string | null;
  notes: string | null;
  lead_type: string | null;
  status: string | null;
  created_at: string;
  external_source_metadata: unknown;
  contacts:
    | {
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        primary_phone: string | null;
        email: string | null;
        city: string | null;
      }
    | {
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        primary_phone: string | null;
        email: string | null;
        city: string | null;
      }[]
    | null;
};

export type MoveCrmLeadToRecruitingResult =
  | { ok: true; recruitingLeadId: string; crmLeadRemoved: boolean }
  | { ok: false; error: string; status: 400 | 404 | 500 };

function contactFromRow(row: CrmLeadRow) {
  const c = row.contacts;
  if (Array.isArray(c)) return c[0] ?? null;
  return c;
}

function buildFullName(row: CrmLeadRow): string {
  const c = contactFromRow(row);
  const fromContact =
    c?.full_name?.trim() ||
    [c?.first_name?.trim(), c?.last_name?.trim()].filter(Boolean).join(" ").trim();
  if (fromContact) return fromContact;
  return "CRM lead moved to recruiting";
}

async function findExistingRecruitingLeadId(
  supabase: SupabaseClient,
  input: { email: string | null; phone: string | null; fullName: string; source: string | null }
): Promise<string | null> {
  const normalizedEmail = input.email ? normalizeRecruitingEmail(input.email) : null;
  const normalizedPhone = input.phone ? normalizeRecruitingPhoneForStorage(input.phone) : null;

  if (normalizedEmail) {
    const { data } = await supabase
      .from("facebook_recruiting_leads")
      .select("id")
      .eq("normalized_email", normalizedEmail)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  if (normalizedPhone) {
    const { data } = await supabase
      .from("facebook_recruiting_leads")
      .select("id")
      .eq("normalized_phone", normalizedPhone)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  const name = input.fullName.trim();
  const source = (input.source ?? "").trim();
  if (name) {
    const { data } = await supabase
      .from("facebook_recruiting_leads")
      .select("id, source")
      .ilike("full_name", name)
      .limit(20);
    for (const row of data ?? []) {
      const rowSource = String((row as { source?: string | null }).source ?? "").trim();
      if (!source || !rowSource || rowSource.toLowerCase() === source.toLowerCase()) {
        return String((row as { id: string }).id);
      }
    }
  }

  return null;
}

async function removeCrmLead(supabase: SupabaseClient, leadId: string): Promise<boolean> {
  const { error: hardErr } = await supabase.from("leads").delete().eq("id", leadId);
  if (!hardErr) return true;

  const now = new Date().toISOString();
  const { data: existing } = await supabase
    .from("leads")
    .select("external_source_metadata")
    .eq("id", leadId)
    .maybeSingle();

  const prevMeta =
    existing?.external_source_metadata && typeof existing.external_source_metadata === "object"
      ? (existing.external_source_metadata as Record<string, unknown>)
      : {};

  const { error: softErr } = await supabase
    .from("leads")
    .update({
      deleted_at: now,
      external_source_metadata: {
        ...prevMeta,
        migrated_to_recruiting: true,
        migrated_to_recruiting_at: now,
        migrated_to_recruiting_manual: true,
      },
    })
    .eq("id", leadId);

  return !softErr;
}

export async function moveCrmLeadToRecruiting(
  supabase: SupabaseClient,
  crmLeadIdRaw: string
): Promise<MoveCrmLeadToRecruitingResult> {
  const crmLeadId = crmLeadIdRaw.trim();
  if (!UUID_RE.test(crmLeadId)) {
    return { ok: false, error: "invalid_crm_lead_id", status: 400 };
  }

  const { data: row, error: loadErr } = await supabase
    .from("leads")
    .select(
      "id, contact_id, source, notes, lead_type, status, created_at, external_source_metadata, contacts ( full_name, first_name, last_name, primary_phone, email, city )"
    )
    .eq("id", crmLeadId)
    .is("deleted_at", null)
    .maybeSingle();

  if (loadErr) {
    console.warn("[move-crm-to-recruiting] load:", loadErr.message);
    return { ok: false, error: loadErr.message, status: 500 };
  }
  if (!row?.id) {
    return { ok: false, error: "crm_lead_not_found", status: 404 };
  }

  const crmLead = row as CrmLeadRow;
  const contact = contactFromRow(crmLead);
  const fullName = buildFullName(crmLead);
  const email = contact?.email?.trim() || null;
  const phone = contact?.primary_phone?.trim() || null;
  const normalizedEmail = email ? normalizeRecruitingEmail(email) : null;
  const normalizedPhone = phone ? normalizeRecruitingPhoneForStorage(phone) : null;

  const employment = parseEmploymentApplicationMeta(crmLead.external_source_metadata);
  const originalSource = (crmLead.source ?? "").trim() || LEGACY_CRM_SOURCE;
  const formName = employment?.position?.trim() || LEGACY_CRM_FORM_NAME;

  const rawPayloadLatest = {
    pipeline: "recruiting",
    migrated_from: "crm_leads",
    migrated_manual: true,
    original_crm_lead_id: crmLead.id,
    original_crm_source: crmLead.source ?? null,
    original_crm_status: crmLead.status ?? null,
    original_crm_lead_type: crmLead.lead_type ?? null,
    employment_application: employment,
    contact: {
      first_name: contact?.first_name ?? null,
      last_name: contact?.last_name ?? null,
      city: contact?.city ?? null,
    },
  };

  const recruitingPatch = {
    full_name: fullName,
    phone,
    email,
    city: contact?.city?.trim() || null,
    form_name: formName,
    license_status: employment?.license_number?.trim() || employment?.position?.trim() || null,
    home_health_experience: employment?.years_experience?.trim() || employment?.experience_message?.trim() || null,
    visits_per_week: employment?.preferred_hours?.trim() || null,
    coverage_area: contact?.city?.trim() || null,
    start_date: employment?.available_start_date?.trim() || null,
    lead_type: "recruiting",
    source: originalSource === "other" ? LEGACY_CRM_SOURCE : originalSource,
    normalized_phone: normalizedPhone,
    normalized_email: normalizedEmail,
    notes: crmLead.notes?.trim() || null,
    raw_payload: {
      latest: rawPayloadLatest,
      history: [],
    },
    created_at: crmLead.created_at,
  };

  const existingLeadId = await findExistingRecruitingLeadId(supabase, {
    email,
    phone,
    fullName,
    source: recruitingPatch.source,
  });

  let recruitingLeadId = existingLeadId;

  if (existingLeadId) {
    const { data: existingRaw } = await supabase
      .from("facebook_recruiting_leads")
      .select("raw_payload, notes")
      .eq("id", existingLeadId)
      .maybeSingle();

    const prevPayload =
      existingRaw?.raw_payload && typeof existingRaw.raw_payload === "object"
        ? (existingRaw.raw_payload as { latest?: Record<string, unknown>; history?: unknown[] })
        : null;
    const history = Array.isArray(prevPayload?.history) ? [...prevPayload!.history!] : [];
    if (prevPayload?.latest) {
      history.push({ received_at: new Date().toISOString(), payload: prevPayload.latest });
    }

    const mergedNotes = [existingRaw?.notes, crmLead.notes?.trim()].filter(Boolean).join("\n\n").slice(0, 8000) || null;

    const { error: upErr } = await supabase
      .from("facebook_recruiting_leads")
      .update({
        ...recruitingPatch,
        notes: mergedNotes,
        raw_payload: {
          latest: rawPayloadLatest,
          history: history.slice(-20),
        },
      })
      .eq("id", existingLeadId);

    if (upErr) {
      return { ok: false, error: upErr.message, status: 500 };
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("facebook_recruiting_leads")
      .insert({
        ...recruitingPatch,
        status: "New",
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      return { ok: false, error: insErr?.message ?? "recruiting_insert_failed", status: 500 };
    }
    recruitingLeadId = String(inserted.id);
  }

  if (!recruitingLeadId) {
    return { ok: false, error: "missing_recruiting_lead_id", status: 500 };
  }

  const crmLeadRemoved = await removeCrmLead(supabase, crmLead.id);
  if (!crmLeadRemoved) {
    return { ok: false, error: "recruiting_created_but_crm_cleanup_failed", status: 500 };
  }

  return { ok: true, recruitingLeadId, crmLeadRemoved: true };
}
