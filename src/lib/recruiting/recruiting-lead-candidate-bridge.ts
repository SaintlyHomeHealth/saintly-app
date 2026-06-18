import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  MANUAL_RESUME_UPLOAD_FORM_NAME,
  MANUAL_RESUME_UPLOAD_LEAD_TYPE,
  MANUAL_RESUME_UPLOAD_PIPELINE,
  MANUAL_RESUME_UPLOAD_SOURCE,
} from "@/lib/recruiting/manual-resume-upload-constants";
import {
  normalizeRecruitingEmail,
  normalizeRecruitingPhoneForStorage,
  recruitingNameCityKey,
} from "@/lib/recruiting/recruiting-contact-normalize";
import { WEBSITE_RECRUITING_PIPELINE } from "@/lib/recruiting/website-recruiting-lead-constants";

export type RecruitingLeadResumeDocumentRow = {
  id: string;
  recruiting_lead_id: string;
  recruiting_candidate_id: string | null;
  storage_path: string;
  file_name: string;
  uploaded_at: string;
  source: string;
  metadata: Record<string, unknown> | null;
};

export type RecruitingCandidateBridgeRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  state: string | null;
  coverage_area: string | null;
  discipline: string | null;
  source: string | null;
  notes: string | null;
  resume_file_name: string | null;
  resume_storage_path: string | null;
  resume_uploaded_at: string | null;
  recruiting_lead_id: string | null;
};

function buildDisplayPhone(rawPhone: string | null, normalizedPhone: string | null): string | null {
  if (rawPhone) return formatPhoneForDisplay(rawPhone) || rawPhone;
  if (normalizedPhone) return formatPhoneForDisplay(normalizedPhone) || normalizedPhone;
  return null;
}

function resumeFilenameKey(fileName: string | null | undefined): string | null {
  const t = (fileName ?? "").trim().toLowerCase();
  return t || null;
}

async function findRecruitingLeadByContact(
  supabase: SupabaseClient,
  input: {
    email: string | null;
    phone: string | null;
    fullName: string;
    city: string | null;
    resumeFileName?: string | null;
  }
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

  const nameCity = recruitingNameCityKey(input.fullName, input.city);
  const resumeKey = resumeFilenameKey(input.resumeFileName);
  if (!normalizedEmail && !normalizedPhone && nameCity) {
    const { data: linkedCandidates } = await supabase
      .from("recruiting_candidates")
      .select("recruiting_lead_id")
      .eq("name_city_key", nameCity)
      .not("recruiting_lead_id", "is", null)
      .limit(5);
    for (const row of linkedCandidates ?? []) {
      const leadId = (row as { recruiting_lead_id?: string | null }).recruiting_lead_id;
      if (leadId) return String(leadId);
    }

    const { data: nameMatches } = await supabase
      .from("facebook_recruiting_leads")
      .select("id, full_name, raw_payload")
      .ilike("full_name", input.fullName.trim())
      .limit(20);
    for (const row of nameMatches ?? []) {
      const payload = (row as { raw_payload?: Record<string, unknown> | null }).raw_payload;
      const latest = payload?.latest;
      const latestObj = latest && typeof latest === "object" ? (latest as Record<string, unknown>) : null;
      const payloadResume =
        typeof latestObj?.resume_file_name === "string"
          ? resumeFilenameKey(latestObj.resume_file_name)
          : typeof latestObj?.file_name === "string"
            ? resumeFilenameKey(latestObj.file_name)
            : null;
      if (!resumeKey || !payloadResume || payloadResume === resumeKey) {
        return String((row as { id: string }).id);
      }
    }
  }

  return null;
}

export async function registerRecruitingLeadResumeDocument(
  supabase: SupabaseClient,
  input: {
    recruitingLeadId: string;
    candidateId?: string | null;
    storagePath: string;
    fileName: string;
    uploadedAt?: string;
    uploadedBy?: string | null;
    source?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const leadId = input.recruitingLeadId.trim();
  const storagePath = input.storagePath.trim();
  const fileName = input.fileName.trim();
  if (!leadId || !storagePath || !fileName) return;

  const { data: existingDoc } = await supabase
    .from("recruiting_lead_resume_documents")
    .select("id")
    .eq("recruiting_lead_id", leadId)
    .eq("storage_path", storagePath)
    .maybeSingle();

  if (existingDoc?.id) return;

  const { error } = await supabase.from("recruiting_lead_resume_documents").insert({
    recruiting_lead_id: leadId,
    recruiting_candidate_id: input.candidateId ?? null,
    storage_path: storagePath,
    file_name: fileName,
    uploaded_at: input.uploadedAt ?? new Date().toISOString(),
    uploaded_by: input.uploadedBy ?? null,
    source: input.source ?? MANUAL_RESUME_UPLOAD_SOURCE,
    metadata: input.metadata ?? {},
  });

  if (error) {
    console.warn("[recruiting-lead-bridge] resume document upsert:", error.message);
  }
}

export async function syncRecruitingLeadForCandidate(
  supabase: SupabaseClient,
  candidateId: string,
  opts?: { uploadedBy?: string | null }
): Promise<{ ok: true; recruitingLeadId: string } | { ok: false; error: string }> {
  const id = candidateId.trim();
  if (!id) return { ok: false, error: "missing_candidate_id" };

  const { data: candidate, error: cErr } = await supabase
    .from("recruiting_candidates")
    .select(
      "id, full_name, phone, email, city, state, coverage_area, discipline, source, notes, resume_file_name, resume_storage_path, resume_uploaded_at, recruiting_lead_id, recruiting_lead_sync_suppressed"
    )
    .eq("id", id)
    .maybeSingle();

  if (cErr || !candidate?.id) {
    return { ok: false, error: cErr?.message ?? "candidate_not_found" };
  }

  const row = candidate as RecruitingCandidateBridgeRow & { recruiting_lead_sync_suppressed?: boolean | null };
  if (row.recruiting_lead_sync_suppressed === true) {
    return { ok: false, error: "recruiting_lead_sync_suppressed" };
  }
  const normalizedEmail = row.email ? normalizeRecruitingEmail(row.email) : null;
  const normalizedPhone = row.phone ? normalizeRecruitingPhoneForStorage(row.phone) : null;

  let leadId = row.recruiting_lead_id?.trim() || null;

  if (leadId) {
    const { data: existingLead } = await supabase
      .from("facebook_recruiting_leads")
      .select("id")
      .eq("id", leadId)
      .maybeSingle();
    if (!existingLead?.id) leadId = null;
  }

  if (!leadId) {
    leadId = await findRecruitingLeadByContact(supabase, {
      email: row.email,
      phone: row.phone,
      fullName: row.full_name,
      city: row.city,
      resumeFileName: row.resume_file_name,
    });
  }

  const coverageArea =
    row.coverage_area?.trim() ||
    [row.city?.trim(), row.state?.trim()].filter(Boolean).join(", ") ||
    null;

  const rawPayload = {
    pipeline: MANUAL_RESUME_UPLOAD_PIPELINE,
    source: MANUAL_RESUME_UPLOAD_SOURCE,
    source_detail: MANUAL_RESUME_UPLOAD_FORM_NAME,
    lead_type: MANUAL_RESUME_UPLOAD_LEAD_TYPE,
    candidate_id: row.id,
    candidate_source: row.source ?? null,
    discipline: row.discipline ?? null,
    resume_file_name: row.resume_file_name ?? null,
    resume_storage_path: row.resume_storage_path ?? null,
    resume_uploaded_at: row.resume_uploaded_at ?? null,
    synced_at: new Date().toISOString(),
  };

  const leadPatch = {
    full_name: row.full_name.trim() || "Resume applicant",
    phone: buildDisplayPhone(row.phone, normalizedPhone),
    email: row.email?.trim() && row.email.includes("@") ? row.email.trim().slice(0, 320) : null,
    city: row.city?.trim() || null,
    form_name: MANUAL_RESUME_UPLOAD_FORM_NAME,
    license_status: row.discipline?.trim() || null,
    coverage_area: coverageArea,
    lead_type: MANUAL_RESUME_UPLOAD_LEAD_TYPE,
    source: MANUAL_RESUME_UPLOAD_SOURCE,
    normalized_phone: normalizedPhone,
    normalized_email: normalizedEmail,
    notes: row.notes?.trim() || null,
    raw_payload: {
      latest: rawPayload,
      history: [],
    },
  };

  if (leadId) {
    const { data: existingRaw } = await supabase
      .from("facebook_recruiting_leads")
      .select("raw_payload, notes")
      .eq("id", leadId)
      .maybeSingle();

    const prevPayload =
      existingRaw?.raw_payload && typeof existingRaw.raw_payload === "object"
        ? (existingRaw.raw_payload as { latest?: Record<string, unknown>; history?: unknown[] })
        : null;
    const history = Array.isArray(prevPayload?.history) ? [...prevPayload!.history!] : [];
    if (prevPayload?.latest) {
      history.push({ received_at: new Date().toISOString(), payload: prevPayload.latest });
    }

    const mergedNotes = [existingRaw?.notes, row.notes?.trim()].filter(Boolean).join("\n\n").slice(0, 8000) || null;

    const { error: upErr } = await supabase
      .from("facebook_recruiting_leads")
      .update({
        ...leadPatch,
        notes: mergedNotes,
        raw_payload: {
          latest: rawPayload,
          history: history.slice(-20),
        },
      })
      .eq("id", leadId);

    if (upErr) {
      console.warn("[recruiting-lead-bridge] lead update:", upErr.message);
      return { ok: false, error: upErr.message };
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("facebook_recruiting_leads")
      .insert({
        ...leadPatch,
        status: "New",
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      console.warn("[recruiting-lead-bridge] lead insert:", insErr?.message);
      return { ok: false, error: insErr?.message ?? "lead_insert_failed" };
    }
    leadId = String(inserted.id);
  }

  if (row.recruiting_lead_id !== leadId) {
    const { error: linkErr } = await supabase
      .from("recruiting_candidates")
      .update({ recruiting_lead_id: leadId })
      .eq("id", row.id);
    if (linkErr) {
      console.warn("[recruiting-lead-bridge] candidate link:", linkErr.message);
    }
  }

  if (row.resume_storage_path?.trim() && row.resume_file_name?.trim()) {
    await registerRecruitingLeadResumeDocument(supabase, {
      recruitingLeadId: leadId,
      candidateId: row.id,
      storagePath: row.resume_storage_path.trim(),
      fileName: row.resume_file_name.trim(),
      uploadedAt: row.resume_uploaded_at ?? undefined,
      uploadedBy: opts?.uploadedBy ?? null,
      metadata: {
        candidate_source: row.source ?? null,
        discipline: row.discipline ?? null,
        pipeline: WEBSITE_RECRUITING_PIPELINE,
      },
    });
  }

  return { ok: true, recruitingLeadId: leadId };
}

type RecruitingCandidateIdentityRow = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  email: string | null;
  city: string | null;
  coverage_area: string | null;
  discipline: string | null;
  preferred_contact_method: string | null;
  crm_contact_id: string | null;
  recruiting_lead_id: string | null;
  recruiting_lead_sync_suppressed: boolean | null;
};

/**
 * Pushes an edited candidate's identity/contact fields onto the already-linked unified
 * `facebook_recruiting_leads` row and CRM contact so the recruiting list, lead record, and
 * call log all reflect the latest name/contact info.
 *
 * Intentionally narrow vs. {@link syncRecruitingLeadForCandidate}: it only touches identity/contact
 * columns and never rewrites lead origin metadata (source, lead_type, form_name, raw_payload). It
 * only updates an existing linked lead — it never creates a new lead from a profile edit.
 */
export async function syncRecruitingCandidateToLinkedRecords(
  supabase: SupabaseClient,
  candidateId: string
): Promise<{ ok: true; recruitingLeadId: string | null } | { ok: false; error: string }> {
  const id = candidateId.trim();
  if (!id) return { ok: false, error: "missing_candidate_id" };

  const { data: candidate, error } = await supabase
    .from("recruiting_candidates")
    .select(
      "id, full_name, first_name, last_name, phone, email, city, coverage_area, discipline, preferred_contact_method, crm_contact_id, recruiting_lead_id, recruiting_lead_sync_suppressed"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !candidate?.id) {
    return { ok: false, error: error?.message ?? "candidate_not_found" };
  }

  const row = candidate as RecruitingCandidateIdentityRow;

  await syncRecruitingCandidateNameToContact(supabase, row);

  if (row.recruiting_lead_sync_suppressed === true) {
    return { ok: true, recruitingLeadId: row.recruiting_lead_id?.trim() || null };
  }

  const leadId = row.recruiting_lead_id?.trim() || null;
  if (!leadId) {
    // No linked lead yet — never create one from a plain profile edit (avoids duplicate lead rows).
    return { ok: true, recruitingLeadId: null };
  }

  const { data: existingLead } = await supabase
    .from("facebook_recruiting_leads")
    .select("id")
    .eq("id", leadId)
    .maybeSingle();
  if (!existingLead?.id) {
    return { ok: true, recruitingLeadId: null };
  }

  const fullName = row.full_name?.trim() || "";
  const normalizedPhone = row.phone ? normalizeRecruitingPhoneForStorage(row.phone) : null;
  const normalizedEmail = row.email ? normalizeRecruitingEmail(row.email) : null;
  const displayPhone = buildDisplayPhone(row.phone, normalizedPhone);

  // Only sync non-empty values so a partially filled candidate never wipes good lead data.
  const patch: Record<string, unknown> = {};
  if (fullName) patch.full_name = fullName;
  if (displayPhone) {
    patch.phone = displayPhone;
    patch.normalized_phone = normalizedPhone;
  }
  if (row.email?.trim() && row.email.includes("@")) {
    patch.email = row.email.trim().slice(0, 320);
    patch.normalized_email = normalizedEmail;
  }
  if (row.city?.trim()) patch.city = row.city.trim();
  if (row.coverage_area?.trim()) patch.coverage_area = row.coverage_area.trim();
  if (row.discipline?.trim()) patch.license_status = row.discipline.trim();
  if (row.preferred_contact_method?.trim()) patch.contact_preference = row.preferred_contact_method.trim();

  if (Object.keys(patch).length === 0) {
    return { ok: true, recruitingLeadId: leadId };
  }

  const { error: upErr } = await supabase
    .from("facebook_recruiting_leads")
    .update(patch)
    .eq("id", leadId);

  if (upErr) {
    // Unique normalized_phone/email collisions or other update failures should not break the candidate save.
    console.warn("[recruiting-lead-bridge] identity sync to lead:", upErr.message);
    return { ok: false, error: upErr.message };
  }

  return { ok: true, recruitingLeadId: leadId };
}

/** Keeps the linked CRM contact's name in step with the candidate so the call log shows the latest name. */
async function syncRecruitingCandidateNameToContact(
  supabase: SupabaseClient,
  row: RecruitingCandidateIdentityRow
): Promise<void> {
  const contactId = row.crm_contact_id?.trim();
  if (!contactId) return;

  const fullName = row.full_name?.trim();
  if (!fullName) return;

  const patch: Record<string, unknown> = { full_name: fullName };
  const first = row.first_name?.trim();
  const last = row.last_name?.trim();
  if (first) patch.first_name = first;
  if (last) patch.last_name = last;

  const { error } = await supabase.from("contacts").update(patch).eq("id", contactId);
  if (error) {
    console.warn("[recruiting-lead-bridge] candidate name sync to contact:", error.message);
  }
}

export async function listRecruitingLeadResumeDocuments(
  supabase: SupabaseClient,
  recruitingLeadId: string
): Promise<RecruitingLeadResumeDocumentRow[]> {
  const { data, error } = await supabase
    .from("recruiting_lead_resume_documents")
    .select("id, recruiting_lead_id, recruiting_candidate_id, storage_path, file_name, uploaded_at, source, metadata")
    .eq("recruiting_lead_id", recruitingLeadId.trim())
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.warn("[recruiting-lead-bridge] list resume documents:", error.message);
    return [];
  }

  return (data ?? []) as RecruitingLeadResumeDocumentRow[];
}

export async function loadRecruitingLeadActivitiesForLead(
  supabase: SupabaseClient,
  recruitingLeadId: string,
  limit = 20
): Promise<
  Array<{
    id: string;
    event_type: string;
    body: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    created_by: string | null;
  }>
> {
  const { data, error } = await supabase
    .from("facebook_recruiting_lead_activities")
    .select("id, event_type, body, metadata, created_at, created_by")
    .eq("lead_id", recruitingLeadId.trim())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    console.warn("[recruiting-lead-bridge] load activities:", error.message);
    return [];
  }

  return (data ?? []) as Array<{
    id: string;
    event_type: string;
    body: string | null;
    metadata: Record<string, unknown> | null;
    created_at: string;
    created_by: string | null;
  }>;
}
