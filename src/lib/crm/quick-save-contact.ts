import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findContactByIncomingPhone, type CrmContactMatch } from "@/lib/crm/find-contact-by-incoming-phone";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { handleNewLeadCreated } from "@/lib/crm/post-create-lead-workflow";
import type { StaffProfile } from "@/lib/staff-profile";
import { canStaffAccessPhoneCallRow } from "@/lib/phone/staff-call-access";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type QuickSaveKind = "contact" | "lead" | "patient" | "employee" | "facility_vendor";

const QUICK_SAVE_KINDS: ReadonlySet<string> = new Set([
  "contact",
  "lead",
  "patient",
  "employee",
  "facility_vendor",
]);

export function parseQuickSaveKind(raw: unknown): QuickSaveKind | null {
  const t = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!t || !QUICK_SAVE_KINDS.has(t)) return null;
  return t as QuickSaveKind;
}

function leadStatusIsActive(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!s) return true;
  return s !== "converted" && s !== "dead_lead";
}

function contactTypeSlugForQuickSave(kind: QuickSaveKind): string {
  switch (kind) {
    case "contact":
      return "other";
    case "lead":
      return "lead";
    case "patient":
      return "patient";
    case "employee":
      return "employee";
    case "facility_vendor":
      return "facility_vendor";
    default:
      return "other";
  }
}

function primaryTagForPhoneCall(kind: QuickSaveKind): string | null {
  switch (kind) {
    case "patient":
      return "patient";
    case "facility_vendor":
      return "vendor";
    case "contact":
      return "other";
    default:
      return null;
  }
}

export type QuickSaveContactDuplicate = {
  ok: "duplicate";
  contact: CrmContactMatch;
  activeLeadId: string | null;
  patientId: string | null;
};

export type QuickSaveContactSuccess = {
  ok: true;
  contactId: string;
  /** Shown in success UI */
  displayName: string;
  e164: string;
  kind: QuickSaveKind;
  leadId: string | null;
  patientId: string | null;
};

export type QuickSaveContactError = { ok: false; error: string; message?: string };

export type QuickSaveContactResult = QuickSaveContactSuccess | QuickSaveContactDuplicate | QuickSaveContactError;

function displayNameFromInput(name: string, e164: string): string | null {
  const n = name.trim();
  if (n) return n;
  return null;
}

/**
 * Fast path: save a dialable number as a CRM contact (not always a lead). Used from workspace keypad / calls.
 */
export async function executeQuickSaveContact(
  supabase: SupabaseClient,
  staff: StaffProfile,
  input: {
    rawPhone: string;
    name: string;
    notes: string;
    kind: QuickSaveKind;
    phoneCallId?: string | null;
  }
): Promise<QuickSaveContactResult> {
  const raw = (input.rawPhone ?? "").trim();
  if (!raw) {
    return { ok: false, error: "missing_phone" };
  }
  const e164 = isValidE164(raw) ? raw : normalizeDialInputToE164(raw);
  if (!e164 || !isValidE164(e164)) {
    return { ok: false, error: "invalid_phone" };
  }

  const existing = await findContactByIncomingPhone(supabase, e164);
  if (existing?.id) {
    const { data: leadRows } = await leadRowsActiveOnly(
      supabase.from("leads").select("id, status").eq("contact_id", existing.id)
    );
    const activeLead = (leadRows ?? []).find((L) => leadStatusIsActive(L.status));
    const { data: pat } = await supabase.from("patients").select("id").eq("contact_id", existing.id).maybeSingle();
    return {
      ok: "duplicate",
      contact: existing,
      activeLeadId: activeLead?.id ? String(activeLead.id) : null,
      patientId: pat?.id ? String(pat.id) : null,
    };
  }

  const fullName = displayNameFromInput(input.name, e164);
  const notes = (input.notes ?? "").trim() || null;
  const contactType = contactTypeSlugForQuickSave(input.kind);

  const { data: inserted, error: insErr } = await supabase
    .from("contacts")
    .insert({
      full_name: fullName,
      primary_phone: e164,
      contact_type: contactType,
      notes,
      owner_user_id: staff.user_id,
    })
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.warn("[crm] quickSaveContact insert contact:", insErr?.message);
    return { ok: false, error: "insert_failed", message: insErr?.message?.slice(0, 200) };
  }

  const contactId = String(inserted.id);
  let leadId: string | null = null;
  let patientId: string | null = null;

  if (input.kind === "lead") {
    const { data: lIns, error: lErr } = await supabase
      .from("leads")
      .insert({ contact_id: contactId, source: "phone", status: "new" })
      .select("id")
      .single();
    if (lErr || !lIns?.id) {
      console.warn("[crm] quickSaveContact insert lead:", lErr?.message);
      return { ok: false, error: "lead_insert_failed" };
    }
    leadId = String(lIns.id);
    await handleNewLeadCreated(supabase, {
      leadId,
      contactId,
      intakeChannel: "phone_workspace",
    });
  } else if (input.kind === "patient") {
    const { data: pIns, error: pErr } = await supabase
      .from("patients")
      .insert({ contact_id: contactId, patient_status: "pending" })
      .select("id")
      .single();
    if (pErr || !pIns?.id) {
      console.warn("[crm] quickSaveContact insert patient:", pErr?.message);
      return { ok: false, error: "patient_insert_failed" };
    }
    patientId = String(pIns.id);
  }

  const displayName = fullName ?? e164;

  const callId = typeof input.phoneCallId === "string" ? input.phoneCallId.trim() : "";
  if (callId && UUID_RE.test(callId)) {
    const { data: callRow, error: callErr } = await supabase
      .from("phone_calls")
      .select("id, contact_id, assigned_to_user_id")
      .eq("id", callId)
      .maybeSingle();

    if (!callErr && callRow?.id) {
      const canLink = canStaffAccessPhoneCallRow(staff, {
        assigned_to_user_id:
          callRow.assigned_to_user_id != null && String(callRow.assigned_to_user_id).trim() !== ""
            ? String(callRow.assigned_to_user_id)
            : null,
      });
      const noContact = callRow.contact_id == null || String(callRow.contact_id).trim() === "";
      if (canLink && noContact) {
        const tag = primaryTagForPhoneCall(input.kind);
        const { error: linkErr } = await supabase
          .from("phone_calls")
          .update({
            contact_id: contactId,
            ...(tag ? { primary_tag: tag } : {}),
          })
          .eq("id", callId);
        if (linkErr) {
          console.warn("[crm] quickSaveContact link phone_call:", linkErr.message);
        }
      }
    }
  }

  return {
    ok: true,
    contactId,
    displayName,
    e164,
    kind: input.kind,
    leadId,
    patientId,
  };
}

export function normalizePhoneInputToE164(raw: string): { e164: string } | { error: string } {
  const t = (raw ?? "").trim();
  if (!t) return { error: "empty" };
  const e164 = isValidE164(t) ? t : normalizeDialInputToE164(t);
  if (!e164 || !isValidE164(e164)) {
    return { error: "invalid" };
  }
  return { e164 };
}

export type ReclassifyContactResult =
  | { ok: true; contactId: string; leadId: string | null; patientId: string | null }
  | { ok: false; error: string; message?: string };

/**
 * Update `contacts.contact_type` and, when the target kind implies a lead or patient row, create those if missing.
 * Does not remove existing leads or patients.
 */
export async function reclassifyContactByQuickKind(
  supabase: SupabaseClient,
  staff: StaffProfile,
  input: { contactId: string; kind: QuickSaveKind }
): Promise<ReclassifyContactResult> {
  const id = (input.contactId ?? "").trim();
  if (!id || !UUID_RE.test(id)) {
    return { ok: false, error: "invalid_contact" };
  }

  const { data: row, error: loadErr } = await supabase.from("contacts").select("id").eq("id", id).maybeSingle();

  if (loadErr) {
    console.warn("[crm] reclassify load contact:", loadErr.message);
    return { ok: false, error: "load_failed" };
  }
  if (!row?.id) {
    return { ok: false, error: "not_found" };
  }

  const contactType = contactTypeSlugForQuickSave(input.kind);
  const { error: upErr } = await supabase
    .from("contacts")
    .update({ contact_type: contactType, owner_user_id: staff.user_id })
    .eq("id", id);

  if (upErr) {
    console.warn("[crm] reclassify update contact:", upErr.message);
    return { ok: false, error: "update_failed" };
  }

  let leadId: string | null = null;
  let patientId: string | null = null;

  if (input.kind === "lead") {
    const { data: patBlock } = await supabase.from("patients").select("id").eq("contact_id", id).maybeSingle();
    if (patBlock?.id) {
      return { ok: false, error: "already_patient" };
    }
    const { data: leadRows } = await leadRowsActiveOnly(
      supabase.from("leads").select("id, status").eq("contact_id", id)
    );
    const active = (leadRows ?? []).find((L) => leadStatusIsActive(L.status));
    if (active?.id) {
      leadId = String(active.id);
    } else {
      const { data: lIns, error: lErr } = await supabase
        .from("leads")
        .insert({ contact_id: id, source: "phone", status: "new" })
        .select("id")
        .single();
      if (lErr || !lIns?.id) {
        return { ok: false, error: "lead_insert_failed" };
      }
      leadId = String(lIns.id);
      await handleNewLeadCreated(supabase, {
        leadId,
        contactId: id,
        intakeChannel: "phone_workspace",
      });
    }
  } else if (input.kind === "patient") {
    const { data: pRow } = await supabase.from("patients").select("id").eq("contact_id", id).maybeSingle();
    if (pRow?.id) {
      patientId = String(pRow.id);
    } else {
      const { data: pIns, error: pErr } = await supabase
        .from("patients")
        .insert({ contact_id: id, patient_status: "pending" })
        .select("id")
        .single();
      if (pErr || !pIns?.id) {
        return { ok: false, error: "patient_insert_failed" };
      }
      patientId = String(pIns.id);
    }
  }

  if (input.kind === "lead" || input.kind === "patient") {
    const { data: p2 } = await supabase.from("patients").select("id").eq("contact_id", id).maybeSingle();
    if (p2?.id) patientId = String(p2.id);
    const { data: leadRows2 } = await leadRowsActiveOnly(
      supabase.from("leads").select("id, status").eq("contact_id", id)
    );
    const l2 = (leadRows2 ?? []).find((L) => leadStatusIsActive(L.status));
    if (l2?.id) leadId = String(l2.id);
  }

  return { ok: true, contactId: id, leadId, patientId };
}
