"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { normalizeFbclid } from "@/lib/crm/fbclid";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { supabaseAdmin } from "@/lib/admin";
import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { handleNewLeadCreated } from "@/lib/crm/post-create-lead-workflow";
import {
  getStaffProfile,
  hasFullCallVisibility,
  isAdminOrHigher,
  isManagerOrHigher,
  isPhoneWorkspaceUser,
} from "@/lib/staff-profile";
import {
  canStaffAccessPhoneCallRow,
  canStaffClaimPhoneCall,
} from "@/lib/phone/staff-call-access";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function crmDisplayNameFromMatch(row: {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
}): string {
  const fn = (row.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return parts || "";
}

export async function updateIncomingCallAlert(formData: FormData) {
  const staff = await getStaffProfile();
  if (!isAdminOrHigher(staff)) {
    return;
  }

  const alertIdRaw = formData.get("alertId");
  const intentRaw = formData.get("intent");
  const id = typeof alertIdRaw === "string" ? alertIdRaw.trim() : "";
  const intent = typeof intentRaw === "string" ? intentRaw.trim() : "";
  if (!id || (intent !== "acknowledge" && intent !== "resolve")) {
    return;
  }

  const now = new Date().toISOString();
  const patch: {
    status: string;
    acknowledged_at?: string | null;
    resolved_at?: string | null;
  } =
    intent === "resolve"
      ? { status: "resolved", resolved_at: now }
      : { status: "acknowledged", acknowledged_at: now };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("incoming_call_alerts").update(patch).eq("id", id);

  if (error) {
    console.warn("[admin/phone] incoming_call_alerts update:", error.message);
    return;
  }

  revalidatePath("/admin/phone");
}

export async function updatePhoneCallNotification(formData: FormData) {
  const staff = await getStaffProfile();
  if (!isAdminOrHigher(staff)) {
    return;
  }

  const notificationIdRaw = formData.get("notificationId");
  const intentRaw = formData.get("intent");
  const id = typeof notificationIdRaw === "string" ? notificationIdRaw.trim() : "";
  const intent = typeof intentRaw === "string" ? intentRaw.trim() : "";
  if (!id || (intent !== "acknowledge" && intent !== "resolve")) {
    return;
  }

  const nextStatus = intent === "resolve" ? "resolved" : "acknowledged";
  const patch: { status: string; acknowledged_at?: string } = { status: nextStatus };
  if (nextStatus === "acknowledged") {
    patch.acknowledged_at = new Date().toISOString();
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("phone_call_notifications").update(patch).eq("id", id);

  if (error) {
    console.warn("[admin/phone] notification update:", error.message);
    return;
  }

  revalidatePath("/admin/phone");
}

/** Server-side allowlist only; empty / whitespace => null. */
function parsePrimaryTagInput(
  raw: FormDataEntryValue | null
): { ok: true; value: string | null } | { ok: false } {
  if (raw == null) {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false };
  }
  const s = raw.trim();
  if (s === "") {
    return { ok: true, value: null };
  }
  if (s === "patient") return { ok: true, value: "patient" };
  if (s === "referral") return { ok: true, value: "referral" };
  if (s === "caregiver") return { ok: true, value: "caregiver" };
  if (s === "family") return { ok: true, value: "family" };
  if (s === "vendor") return { ok: true, value: "vendor" };
  if (s === "spam") return { ok: true, value: "spam" };
  if (s === "other") return { ok: true, value: "other" };
  return { ok: false };
}

export async function updatePhoneCallPrimaryTag(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return;
  }

  const idRaw = formData.get("phoneCallId");
  const tagRaw = formData.get("primaryTag");
  const phoneCallId = typeof idRaw === "string" ? idRaw.trim() : "";
  const parsed = parsePrimaryTagInput(tagRaw);

  if (!phoneCallId || !parsed.ok) {
    return;
  }

  const { data: callRow, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select("assigned_to_user_id")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (loadErr || !callRow) {
    console.warn("[admin/phone] updatePhoneCallPrimaryTag load:", loadErr?.message);
    return;
  }
  if (!canStaffAccessPhoneCallRow(staff, { assigned_to_user_id: callRow.assigned_to_user_id as string | null })) {
    return;
  }

  const { error } = await supabaseAdmin
    .from("phone_calls")
    // Only primary_tag — no other phone_calls columns.
    .update({ primary_tag: parsed.value })
    .eq("id", phoneCallId);

  if (error) {
    console.warn("[admin/phone] updatePhoneCallPrimaryTag:", error.message);
    return;
  }

  revalidatePath("/admin/phone");
}

const CRM_CLASSIFICATION_TAGS_MAX = 500;
const CRM_CLASSIFICATION_NOTE_MAX = 20000;

export type UpdatePhoneCallCrmClassificationResult =
  | { ok: true }
  | { ok: false; error: string };

/** Persists CRM drawer fields under `phone_calls.metadata.crm` (merges with existing metadata). */
export async function updatePhoneCallCrmClassification(
  formData: FormData
): Promise<UpdatePhoneCallCrmClassificationResult> {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const idRaw = formData.get("phoneCallId");
  const phoneCallId = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!phoneCallId || !UUID_RE.test(phoneCallId)) {
    return { ok: false, error: "invalid_call" };
  }

  const typeRaw = formData.get("type");
  const outcomeRaw = formData.get("outcome");
  const tagsRaw = formData.get("tags");
  const noteRaw = formData.get("note");

  const type = typeof typeRaw === "string" ? typeRaw.trim() : "";
  const outcome = typeof outcomeRaw === "string" ? outcomeRaw.trim() : "";
  const tags =
    typeof tagsRaw === "string" ? tagsRaw.trim().slice(0, CRM_CLASSIFICATION_TAGS_MAX) : "";
  const note =
    typeof noteRaw === "string" ? noteRaw.trim().slice(0, CRM_CLASSIFICATION_NOTE_MAX) : "";

  if (
    type !== "" &&
    type !== "patient" &&
    type !== "caregiver" &&
    type !== "referral" &&
    type !== "spam"
  ) {
    return { ok: false, error: "invalid_type" };
  }
  if (
    outcome !== "" &&
    outcome !== "booked_assessment" &&
    outcome !== "needs_followup" &&
    outcome !== "not_qualified" &&
    outcome !== "wrong_number"
  ) {
    return { ok: false, error: "invalid_outcome" };
  }

  const { data: callRow, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select("assigned_to_user_id, metadata")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (loadErr || !callRow) {
    console.warn("[admin/phone] updatePhoneCallCrmClassification load:", loadErr?.message);
    return { ok: false, error: "load_failed" };
  }
  if (
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id: callRow.assigned_to_user_id as string | null,
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  const existingMeta =
    callRow.metadata && typeof callRow.metadata === "object" && !Array.isArray(callRow.metadata)
      ? (callRow.metadata as Record<string, unknown>)
      : {};
  const prevCrm =
    existingMeta.crm && typeof existingMeta.crm === "object" && !Array.isArray(existingMeta.crm)
      ? (existingMeta.crm as Record<string, unknown>)
      : {};

  const nextCrm: Record<string, unknown> = {
    ...prevCrm,
    type: type || "",
    outcome: outcome || "",
    tags,
    note,
  };

  const nextMetadata: Record<string, unknown> = {
    ...existingMeta,
    crm: nextCrm,
  };

  const { error } = await supabaseAdmin
    .from("phone_calls")
    .update({ metadata: nextMetadata })
    .eq("id", phoneCallId);

  if (error) {
    console.warn("[admin/phone] updatePhoneCallCrmClassification:", error.message);
    return { ok: false, error: "update_failed" };
  }

  revalidatePath("/admin/phone");
  revalidatePath("/admin/phone/calls");
  return { ok: true };
}

const CONTACT_FULL_NAME_MAX = 500;

export type UpdateContactFullNameResult = { ok: true } | { ok: false; error: string };

export async function updateContactFullName(formData: FormData): Promise<UpdateContactFullNameResult> {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const idRaw = formData.get("contactId");
  const nameRaw = formData.get("fullName");
  const contactId = typeof idRaw === "string" ? idRaw.trim() : "";
  const fullName =
    typeof nameRaw === "string" ? nameRaw.trim().slice(0, CONTACT_FULL_NAME_MAX) : "";

  if (!contactId || !fullName) {
    return { ok: false, error: "invalid" };
  }

  const { data: exists, error: loadErr } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("id", contactId)
    .maybeSingle();

  if (loadErr) {
    console.warn("[admin/phone] updateContactFullName load:", loadErr.message);
    return { ok: false, error: "load_failed" };
  }
  if (!exists?.id) {
    return { ok: false, error: "not_found" };
  }

  const { error } = await supabaseAdmin
    .from("contacts")
    .update({ full_name: fullName })
    .eq("id", contactId);

  if (error) {
    console.warn("[admin/phone] updateContactFullName:", error.message);
    return { ok: false, error: "update_failed" };
  }

  revalidatePath("/admin/phone");
  return { ok: true };
}

function leadStatusIsActive(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!s) return true;
  return s !== "converted" && s !== "dead_lead";
}

export type CreateLeadFromContactResult = { ok: true; leadId: string } | { ok: false; error: string };

export async function createLeadFromContact(
  contactId: string,
  options?: { fbclid?: string | null }
): Promise<CreateLeadFromContactResult> {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const id = typeof contactId === "string" ? contactId.trim() : "";
  if (!id) {
    return { ok: false, error: "invalid" };
  }

  const { data: contact, error: cErr } = await supabaseAdmin
    .from("contacts")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (cErr) {
    console.warn("[admin/phone] createLeadFromContact load contact:", cErr.message);
    return { ok: false, error: "load_failed" };
  }
  if (!contact?.id) {
    return { ok: false, error: "contact_not_found" };
  }

  const { data: patientRow } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("contact_id", id)
    .maybeSingle();
  if (patientRow?.id) {
    return { ok: false, error: "already_patient" };
  }

  const { data: leadRows, error: leadsErr } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("id, status").eq("contact_id", id)
  );

  if (leadsErr) {
    console.warn("[admin/phone] createLeadFromContact list leads:", leadsErr.message);
    return { ok: false, error: "load_failed" };
  }

  if ((leadRows ?? []).some((L) => leadStatusIsActive(L.status))) {
    return { ok: false, error: "active_lead_exists" };
  }

  const fbclid = normalizeFbclid(options?.fbclid ?? null);
  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("leads")
    .insert({
      contact_id: id,
      source: "phone",
      status: "new",
      ...(fbclid ? { fbclid } : {}),
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.warn("[admin/phone] createLeadFromContact insert:", insErr?.message);
    return { ok: false, error: "insert_failed" };
  }

  await handleNewLeadCreated(supabaseAdmin, {
    leadId: String(inserted.id),
    contactId: id,
    intakeChannel: "phone_workspace",
  });

  revalidatePath("/admin/phone");
  return { ok: true, leadId: String(inserted.id) };
}

export type CreateLeadFromPhoneCallIdResult =
  | { ok: true; leadId: string; contactId: string }
  | { ok: false; error: string };

/**
 * Links/creates CRM contact from the call party number, then ensures an active lead.
 * Used by the admin call log and POST /api/leads/create-from-call.
 */
export async function createLeadFromPhoneCallId(
  phoneCallId: string,
  options?: { fbclid?: string | null }
): Promise<CreateLeadFromPhoneCallIdResult> {
  const contactRes = await createContactFromPhoneCall(phoneCallId);
  if (!contactRes.ok) {
    return { ok: false, error: contactRes.error };
  }

  const leadRes = await createLeadFromContact(contactRes.contactId, options);
  if (leadRes.ok) {
    revalidatePath("/admin/crm/leads");
    revalidatePath(`/admin/crm/leads/${leadRes.leadId}`);
    revalidatePath("/admin/phone");
    return { ok: true, leadId: leadRes.leadId, contactId: contactRes.contactId };
  }

  if (leadRes.error === "active_lead_exists") {
    const { data: rows, error: listErr } = await leadRowsActiveOnly(
      supabaseAdmin
        .from("leads")
        .select("id, status, created_at")
        .eq("contact_id", contactRes.contactId)
        .order("created_at", { ascending: false })
    );
    if (listErr) {
      console.warn("[admin/phone] createLeadFromPhoneCallId list leads:", listErr.message);
      return { ok: false, error: leadRes.error };
    }
    const active = (rows ?? []).find((L) => leadStatusIsActive(L.status));
    if (active?.id) {
      revalidatePath("/admin/phone");
      revalidatePath("/admin/crm/leads");
      return { ok: true, leadId: String(active.id), contactId: contactRes.contactId };
    }
  }

  return { ok: false, error: leadRes.error };
}

export type ConvertLeadToPatientResult =
  | { ok: true; patientId: string }
  | { ok: false; error: string };

export async function convertLeadToPatient(leadId: string): Promise<ConvertLeadToPatientResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const id = typeof leadId === "string" ? leadId.trim() : "";
  if (!id) {
    return { ok: false, error: "invalid" };
  }

  const { data: lead, error: lErr } = await leadRowsActiveOnly(
    supabaseAdmin
      .from("leads")
      .select(
        "id, contact_id, status, referring_provider_name, referring_provider_phone, referring_doctor_name, doctor_office_name, doctor_office_phone, doctor_office_fax, doctor_office_contact_person, payer_name, payer_type, referral_source, service_type, service_disciplines, intake_status"
      )
      .eq("id", id)
  ).maybeSingle();

  if (lErr) {
    console.warn("[admin/phone] convertLeadToPatient load lead:", lErr.message);
    return { ok: false, error: "load_failed" };
  }
  if (!lead?.contact_id) {
    return { ok: false, error: "lead_not_found" };
  }

  const st = typeof lead.status === "string" ? lead.status.trim().toLowerCase() : "";
  if (st === "converted") {
    return { ok: false, error: "already_converted" };
  }
  if (st === "dead_lead") {
    return { ok: false, error: "lead_dead" };
  }

  const cid = String(lead.contact_id);

  const { data: existingPatient } = await supabaseAdmin
    .from("patients")
    .select("id")
    .eq("contact_id", cid)
    .maybeSingle();
  if (existingPatient?.id) {
    return { ok: false, error: "patient_exists" };
  }

  const L = lead as {
    service_disciplines?: string[] | null;
    referring_doctor_name?: string | null;
    doctor_office_name?: string | null;
    doctor_office_phone?: string | null;
    doctor_office_fax?: string | null;
    doctor_office_contact_person?: string | null;
  };

  const leadDisc = L.service_disciplines;
  const serviceDisciplines =
    Array.isArray(leadDisc) && leadDisc.length > 0 ? leadDisc : ([] as string[]);

  const doctorName = (L.referring_doctor_name ?? "").trim() || null;
  const legacyRefName = (lead.referring_provider_name ?? "").trim() || null;
  const physician_name = doctorName || legacyRefName;
  const referring_provider_phone =
    (lead.referring_provider_phone ?? "").trim() || (L.doctor_office_phone ?? "").trim() || null;

  const { data: newPatient, error: pErr } = await supabaseAdmin
    .from("patients")
    .insert({
      contact_id: cid,
      patient_status: "active",
      referring_provider_name: legacyRefName,
      referring_provider_phone,
      referring_doctor_name: doctorName,
      doctor_office_name: (L.doctor_office_name ?? "").trim() || null,
      doctor_office_phone: (L.doctor_office_phone ?? "").trim() || null,
      doctor_office_fax: (L.doctor_office_fax ?? "").trim() || null,
      doctor_office_contact_person: (L.doctor_office_contact_person ?? "").trim() || null,
      payer_name: lead.payer_name ?? null,
      payer_type: lead.payer_type ?? null,
      referral_source: lead.referral_source ?? null,
      service_type: lead.service_type ?? null,
      service_disciplines: serviceDisciplines,
      intake_status: lead.intake_status ?? null,
      physician_name,
    })
    .select("id")
    .single();

  if (pErr || !newPatient?.id) {
    console.warn("[admin/phone] convertLeadToPatient insert patient:", pErr?.message);
    return { ok: false, error: "insert_failed" };
  }

  const patientId = String(newPatient.id);

  const { error: uErr } = await supabaseAdmin
    .from("leads")
    .update({ status: "converted" })
    .eq("id", id)
    .is("deleted_at", null);

  if (uErr) {
    console.warn("[admin/phone] convertLeadToPatient update lead:", uErr.message);
    return { ok: false, error: "update_failed" };
  }

  revalidatePath("/admin/phone");
  revalidatePath("/admin/crm/patients");
  revalidatePath("/admin/crm/leads");
  revalidatePath("/admin/crm/contacts");
  revalidatePath(`/admin/crm/contacts/${cid}`);
  revalidatePath(`/admin/crm/leads/${id}`);
  revalidatePath("/admin");
  revalidatePath("/workspace/phone/chat");
  return { ok: true, patientId };
}

export type CreateContactFromPhoneCallResult =
  | { ok: true; contactId: string; crm_contact_display_name: string }
  | { ok: false; error: string };

/**
 * Creates a CRM contact from a call's From number (or links an existing contact on that phone),
 * then sets phone_calls.contact_id. Admin UI only; uses service role.
 */
export async function createContactFromPhoneCall(
  phoneCallId: string
): Promise<CreateContactFromPhoneCallResult> {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const id = typeof phoneCallId === "string" ? phoneCallId.trim() : "";
  if (!id) {
    return { ok: false, error: "missing_call_id" };
  }

  const { data: callRow, error: callErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, from_e164, to_e164, direction, contact_id, assigned_to_user_id")
    .eq("id", id)
    .maybeSingle();

  if (callErr) {
    console.warn("[admin/phone] createContactFromPhoneCall load:", callErr.message);
    return { ok: false, error: "load_failed" };
  }
  if (!callRow?.id) {
    return { ok: false, error: "call_not_found" };
  }
  if (
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id:
        callRow.assigned_to_user_id != null && String(callRow.assigned_to_user_id).trim() !== ""
          ? String(callRow.assigned_to_user_id)
          : null,
    })
  ) {
    return { ok: false, error: "forbidden" };
  }

  const existingContactId =
    callRow.contact_id != null && String(callRow.contact_id).trim() !== ""
      ? String(callRow.contact_id)
      : null;
  if (existingContactId) {
    const { data: c, error: cErr } = await supabaseAdmin
      .from("contacts")
      .select("id, full_name, first_name, last_name")
      .eq("id", existingContactId)
      .maybeSingle();
    if (cErr || !c) {
      return { ok: true, contactId: existingContactId, crm_contact_display_name: existingContactId };
    }
    const label = crmDisplayNameFromMatch({
      full_name: typeof c.full_name === "string" ? c.full_name : null,
      first_name: typeof c.first_name === "string" ? c.first_name : null,
      last_name: typeof c.last_name === "string" ? c.last_name : null,
    });
    return {
      ok: true,
      contactId: existingContactId,
      crm_contact_display_name: label || existingContactId,
    };
  }

  const dir = String(callRow.direction ?? "").trim().toLowerCase();
  const rawFrom = typeof callRow.from_e164 === "string" ? callRow.from_e164.trim() : "";
  const rawTo = typeof callRow.to_e164 === "string" ? callRow.to_e164.trim() : "";
  /** Other party (caller on inbound, callee on outbound). */
  const partyE164 =
    dir === "outbound" ? rawTo || rawFrom : rawFrom || rawTo;
  if (!partyE164) {
    return { ok: false, error: "missing_from_number" };
  }

  const existing = await findContactByIncomingPhone(supabaseAdmin, partyE164);
  let contactId: string;
  let displayName: string;

  if (existing?.id) {
    contactId = existing.id;
    displayName = crmDisplayNameFromMatch(existing) || partyE164;
  } else {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("contacts")
      .insert({ full_name: partyE164, primary_phone: partyE164 })
      .select("id, full_name, first_name, last_name")
      .single();

    if (insErr || !inserted?.id) {
      console.warn("[admin/phone] createContactFromPhoneCall insert:", insErr?.message);
      return { ok: false, error: "insert_failed" };
    }
    contactId = String(inserted.id);
    displayName = crmDisplayNameFromMatch({
      full_name: typeof inserted.full_name === "string" ? inserted.full_name : null,
      first_name: typeof inserted.first_name === "string" ? inserted.first_name : null,
      last_name: typeof inserted.last_name === "string" ? inserted.last_name : null,
    });
    if (!displayName) displayName = partyE164;
  }

  const { data: linked, error: linkErr } = await supabaseAdmin
    .from("phone_calls")
    .update({ contact_id: contactId })
    .eq("id", id)
    .is("contact_id", null)
    .select("id, contact_id")
    .maybeSingle();

  if (linkErr) {
    console.warn("[admin/phone] createContactFromPhoneCall link:", linkErr.message);
    return { ok: false, error: "link_failed" };
  }

  if (!linked?.id) {
    const { data: again } = await supabaseAdmin
      .from("phone_calls")
      .select("contact_id")
      .eq("id", id)
      .maybeSingle();
    const cid =
      again?.contact_id != null && String(again.contact_id).trim() !== ""
        ? String(again.contact_id)
        : null;
    if (cid) {
      const { data: c2 } = await supabaseAdmin
        .from("contacts")
        .select("full_name, first_name, last_name")
        .eq("id", cid)
        .maybeSingle();
      const label = c2
        ? crmDisplayNameFromMatch({
            full_name: typeof c2.full_name === "string" ? c2.full_name : null,
            first_name: typeof c2.first_name === "string" ? c2.first_name : null,
            last_name: typeof c2.last_name === "string" ? c2.last_name : null,
          })
        : "";
      revalidatePath("/admin/phone");
      return { ok: true, contactId: cid, crm_contact_display_name: label || cid };
    }
    return { ok: false, error: "link_race" };
  }

  revalidatePath("/admin/phone");

  return { ok: true, contactId, crm_contact_display_name: displayName };
}

const INTAKE_NAME_MAX = 500;

function parseIntakeContactType(raw: unknown): "patient" | "family" | "referral" | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "patient" || s === "family" || s === "referral") return s;
  return null;
}

/**
 * Minimal intake: create/link CRM contact and set phone_calls.contact_id + primary_tag.
 */
export async function createContactIntakeFromPhoneCall(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    redirect("/admin");
  }

  const callId = String(formData.get("phoneCallId") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim().slice(0, INTAKE_NAME_MAX);
  const phoneRaw = String(formData.get("phone") ?? "").trim();
  const intakeType = parseIntakeContactType(formData.get("intakeType"));

  const intakeErr = (code: string): never => {
    if (callId && UUID_RE.test(callId)) {
      redirect(`/admin/phone/${callId}?err=${code}`);
    }
    redirect(`/admin/phone?err=${code}`);
  };

  if (!callId || !UUID_RE.test(callId)) {
    intakeErr("intake");
  }
  if (!fullName || !intakeType) {
    intakeErr("intake");
  }

  const phoneE164 = normalizeDialInputToE164(phoneRaw);
  if (!phoneE164 || !isValidE164(phoneE164)) {
    intakeErr("intake_phone");
  }

  const { data: callRow, error: callErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, from_e164, to_e164, direction, contact_id, assigned_to_user_id")
    .eq("id", callId)
    .maybeSingle();

  if (callErr) {
    console.warn("[admin/phone] createContactIntakeFromPhoneCall load:", callErr.message);
    intakeErr("intake");
  }
  if (!callRow || !callRow.id) {
    if (callId && UUID_RE.test(callId)) {
      redirect(`/admin/phone/${callId}?err=intake`);
    }
    redirect(`/admin/phone?err=intake`);
  }

  if (
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id:
        callRow.assigned_to_user_id != null && String(callRow.assigned_to_user_id).trim() !== ""
          ? String(callRow.assigned_to_user_id)
          : null,
    })
  ) {
    intakeErr("intake_forbidden");
  }

  const existingCid =
    callRow.contact_id != null && String(callRow.contact_id).trim() !== ""
      ? String(callRow.contact_id)
      : null;
  if (existingCid) {
    intakeErr("intake_exists");
  }

  const byPhone = await findContactByIncomingPhone(supabaseAdmin, phoneE164);
  let contactId: string;

  if (byPhone?.id) {
    contactId = byPhone.id;
    const { error: upErr } = await supabaseAdmin
      .from("contacts")
      .update({
        full_name: fullName,
        contact_type: intakeType,
        primary_phone: phoneE164,
      })
      .eq("id", contactId);

    if (upErr) {
      console.warn("[admin/phone] createContactIntakeFromPhoneCall update contact:", upErr.message);
      intakeErr("intake");
    }
  } else {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("contacts")
      .insert({
        full_name: fullName,
        primary_phone: phoneE164,
        contact_type: intakeType,
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      console.warn("[admin/phone] createContactIntakeFromPhoneCall insert:", insErr?.message);
      if (callId && UUID_RE.test(callId)) {
        redirect(`/admin/phone/${callId}?err=intake`);
      }
      redirect(`/admin/phone?err=intake`);
    }
    contactId = String(inserted.id);
  }

  const { error: linkErr } = await supabaseAdmin
    .from("phone_calls")
    .update({
      contact_id: contactId,
      primary_tag: intakeType,
    })
    .eq("id", callId)
    .is("contact_id", null);

  if (linkErr) {
    console.warn("[admin/phone] createContactIntakeFromPhoneCall link:", linkErr.message);
    intakeErr("intake");
  }

  revalidatePath("/admin/phone");
  revalidatePath(`/admin/phone/${callId}`);
  redirect(`/admin/phone/${callId}?ok=intake`);
}

const NOTE_BODY_MAX = 20000;

export async function createPhoneCallNote(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return;
  }

  const idRaw = formData.get("phoneCallId");
  const bodyRaw = formData.get("body");
  const phoneCallId = typeof idRaw === "string" ? idRaw.trim() : "";
  const body =
    typeof bodyRaw === "string" ? bodyRaw.trim().slice(0, NOTE_BODY_MAX) : "";

  if (!phoneCallId || !body) {
    return;
  }

  const { data: exists, error: callErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, assigned_to_user_id")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (callErr) {
    console.warn("[admin/phone] createPhoneCallNote load call:", callErr.message);
    return;
  }
  if (!exists?.id) {
    console.warn("[admin/phone] createPhoneCallNote: call not found", { phoneCallId });
    return;
  }
  if (
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id: exists.assigned_to_user_id as string | null,
    })
  ) {
    return;
  }

  const { error: insErr } = await supabaseAdmin.from("phone_call_notes").insert({
    phone_call_id: phoneCallId,
    body,
    created_by_user_id: staff.user_id,
  });

  if (insErr) {
    console.warn("[admin/phone] createPhoneCallNote:", insErr.message);
    return;
  }

  revalidatePath(`/admin/phone/${phoneCallId}`);
}

const TASK_TITLE_MAX = 500;

export async function createPhoneCallTask(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return;
  }

  const callIdRaw = formData.get("phoneCallId");
  const titleRaw = formData.get("title");
  const phoneCallId = typeof callIdRaw === "string" ? callIdRaw.trim() : "";
  const title =
    typeof titleRaw === "string" ? titleRaw.trim().slice(0, TASK_TITLE_MAX) : "";

  if (!phoneCallId || !title) {
    return;
  }

  const { data: callRow, error: callErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, assigned_to_user_id")
    .eq("id", phoneCallId)
    .maybeSingle();

  if (callErr) {
    console.warn("[admin/phone] createPhoneCallTask load call:", callErr.message);
    return;
  }
  if (!callRow?.id) {
    console.warn("[admin/phone] createPhoneCallTask: call not found", { phoneCallId });
    return;
  }
  if (
    !canStaffAccessPhoneCallRow(staff, {
      assigned_to_user_id: callRow.assigned_to_user_id as string | null,
    })
  ) {
    return;
  }

  const ownerId = callRow.assigned_to_user_id as string | null | undefined;
  const assignTo = ownerId ? ownerId : staff.user_id;

  const { error: insErr } = await supabaseAdmin.from("phone_call_tasks").insert({
    phone_call_id: phoneCallId,
    title,
    status: "open",
    priority: "normal",
    assigned_to_user_id: assignTo,
    created_by_user_id: staff.user_id,
  });

  if (insErr) {
    console.warn("[admin/phone] createPhoneCallTask:", insErr.message);
    return;
  }

  revalidatePath("/admin/phone");
  revalidatePath("/admin/phone/tasks");
  revalidatePath("/workspace/phone/tasks");
  revalidatePath("/workspace/phone/voicemail");
}

type TaskStatus = "open" | "in_progress" | "completed" | "canceled";

/** Strict server-side only: rejects unknown strings, casing, and whitespace variants. */
function parseAllowedTaskStatus(raw: unknown): TaskStatus | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  if (s === "open") return "open";
  if (s === "in_progress") return "in_progress";
  if (s === "completed") return "completed";
  if (s === "canceled") return "canceled";
  return null;
}

export async function updatePhoneCallTaskStatus(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const idRaw = formData.get("taskId");
  const statusRaw = formData.get("status");
  const taskId = typeof idRaw === "string" ? idRaw.trim() : "";
  const status = parseAllowedTaskStatus(statusRaw);

  if (!taskId || !status) {
    return;
  }

  const now = new Date().toISOString();
  const patch: {
    status: TaskStatus;
    completed_at: string | null;
  } = {
    status,
    completed_at: status === "completed" ? now : null,
  };

  const { error } = await supabaseAdmin.from("phone_call_tasks").update(patch).eq("id", taskId);

  if (error) {
    console.warn("[admin/phone] updatePhoneCallTaskStatus:", error.message);
    return;
  }

  revalidatePath("/admin/phone");
  revalidatePath("/admin/phone/tasks");
}

export async function assignPhoneCallTaskToMe(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const idRaw = formData.get("taskId");
  const taskId = typeof idRaw === "string" ? idRaw.trim() : "";
  if (!taskId) {
    return;
  }

  // Only assigned_to_user_id — do not touch created_by_user_id, completed_at, or phone_calls.
  const { error } = await supabaseAdmin
    .from("phone_call_tasks")
    .update({ assigned_to_user_id: staff.user_id })
    .eq("id", taskId);

  if (error) {
    console.warn("[admin/phone] assignPhoneCallTaskToMe:", error.message);
    return;
  }

  revalidatePath("/admin/phone");
  revalidatePath("/admin/phone/tasks");
}

function assigneeLabelFromStaff(staff: {
  email: string | null;
  user_id: string;
  full_name?: string | null;
}): string {
  const e = staff.email?.trim();
  if (e) return e;
  const n = staff.full_name?.trim();
  if (n) return n;
  return `User ${staff.user_id.slice(0, 8)}…`;
}

/** Returned by claim/assign/unassign for client optimistic UI; does not change server rules. */
export type PhoneOwnershipMutationResult = { ok: true } | { ok: false };

/**
 * First claim wins: only updates when assigned_to_user_id IS NULL.
 */
export async function claimPhoneCall(
  formData: FormData
): Promise<PhoneOwnershipMutationResult> {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff)) {
    return { ok: false };
  }

  const raw = formData.get("callId");
  const callId = typeof raw === "string" ? raw.trim() : "";
  if (!callId) {
    return { ok: false };
  }

  const { data: existing, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, assigned_to_user_id")
    .eq("id", callId)
    .maybeSingle();

  if (loadErr || !existing?.id) {
    console.warn("[admin/phone] claimPhoneCall load:", loadErr?.message);
    return { ok: false };
  }

  const vis = { assigned_to_user_id: existing.assigned_to_user_id as string | null };
  if (!canStaffClaimPhoneCall(staff, vis)) {
    return { ok: false };
  }

  const now = new Date().toISOString();
  const label = assigneeLabelFromStaff(staff);

  const { data, error } = await supabaseAdmin
    .from("phone_calls")
    .update({
      assigned_to_user_id: staff.user_id,
      assigned_at: now,
      assigned_to_label: label,
    })
    .eq("id", callId)
    .is("assigned_to_user_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[admin/phone] claimPhoneCall:", error.message);
    return { ok: false };
  }
  if (!data?.id) {
    console.warn("[admin/phone] claimPhoneCall: already assigned or not found", { callId });
    return { ok: false };
  }

  revalidatePath("/admin/phone");
  revalidatePath("/admin/phone/calls");
  revalidatePath(`/admin/phone/${callId}`);
  return { ok: true };
}

/** Manager/admin/super_admin: assign any call to an active staff login. */
export async function assignPhoneCall(
  formData: FormData
): Promise<PhoneOwnershipMutationResult> {
  const staff = await getStaffProfile();
  if (!staff || !hasFullCallVisibility(staff)) {
    return { ok: false };
  }

  const callRaw = formData.get("callId");
  const userRaw = formData.get("assignToUserId");
  const callId = typeof callRaw === "string" ? callRaw.trim() : "";
  const assignToUserId = typeof userRaw === "string" ? userRaw.trim() : "";
  if (!callId || !assignToUserId || !UUID_RE.test(assignToUserId)) {
    return { ok: false };
  }

  const { data: target, error: tErr } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, email, full_name, is_active")
    .eq("user_id", assignToUserId)
    .maybeSingle();

  if (tErr || !target?.user_id || target.is_active === false) {
    console.warn("[admin/phone] assignPhoneCall target:", tErr?.message);
    return { ok: false };
  }

  const now = new Date().toISOString();
  const label = assigneeLabelFromStaff({
    email: typeof target.email === "string" ? target.email : null,
    full_name: typeof target.full_name === "string" ? target.full_name : null,
    user_id: String(target.user_id),
  });

  const { error } = await supabaseAdmin
    .from("phone_calls")
    .update({
      assigned_to_user_id: assignToUserId,
      assigned_at: now,
      assigned_to_label: label,
    })
    .eq("id", callId);

  if (error) {
    console.warn("[admin/phone] assignPhoneCall:", error.message);
    return { ok: false };
  }

  revalidatePath("/admin/phone");
  revalidatePath("/admin/phone/calls");
  revalidatePath(`/admin/phone/${callId}`);
  return { ok: true };
}

export async function unassignPhoneCall(
  formData: FormData
): Promise<PhoneOwnershipMutationResult> {
  const staff = await getStaffProfile();
  if (!isAdminOrHigher(staff)) {
    return { ok: false };
  }

  const raw = formData.get("callId");
  const callId = typeof raw === "string" ? raw.trim() : "";
  if (!callId) {
    return { ok: false };
  }

  const { error } = await supabaseAdmin
    .from("phone_calls")
    .update({
      assigned_to_user_id: null,
      assigned_at: null,
      assigned_to_label: null,
    })
    .eq("id", callId);

  if (error) {
    console.warn("[admin/phone] unassignPhoneCall:", error.message);
    return { ok: false };
  }

  revalidatePath("/admin/phone");
  revalidatePath("/admin/phone/calls");
  revalidatePath(`/admin/phone/${callId}`);
  return { ok: true };
}

/** Native `<form action>` requires `Promise<void>`; mutation outcomes are unchanged (see claim/assign/unassign). */
export async function claimPhoneCallFormAction(formData: FormData): Promise<void> {
  await claimPhoneCall(formData);
}

export async function assignPhoneCallFormAction(formData: FormData): Promise<void> {
  await assignPhoneCall(formData);
}

export async function unassignPhoneCallFormAction(formData: FormData): Promise<void> {
  await unassignPhoneCall(formData);
}
