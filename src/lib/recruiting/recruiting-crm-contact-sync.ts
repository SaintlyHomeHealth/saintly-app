import type { SupabaseClient } from "@supabase/supabase-js";

import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { findContactByNormalizedEmail } from "@/lib/crm/find-contact-by-email";
import { normalizeRecruitingEmail } from "@/lib/recruiting/recruiting-contact-normalize";
import { pickOutboundE164ForDial } from "@/lib/workspace-phone/launch-urls";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EnsureRecruitingCrmContactResult = {
  contactId: string | null;
  dialE164: string | null;
  contextName: string | null;
};

/**
 * Ensures `recruiting_candidates.crm_contact_id` points at a shared CRM contact so inbound
 * calls/texts resolve the same way as the rest of the app (`findContactByIncomingPhone`).
 *
 * Match order: normalized phone (E.164 lookup) → normalized email → create when needed.
 * Existing links are kept when the candidate still matches the same contact by phone or email.
 */
export async function ensureRecruitingCandidateCrmContact(
  supabase: SupabaseClient,
  candidateId: string
): Promise<EnsureRecruitingCrmContactResult> {
  const id = candidateId.trim();
  if (!UUID_RE.test(id)) {
    return { contactId: null, dialE164: null, contextName: null };
  }

  const { data: cand, error } = await supabase
    .from("recruiting_candidates")
    .select(
      "id, full_name, first_name, last_name, phone, email, city, state, zip, crm_contact_id"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !cand?.id) {
    console.warn("[recruiting-crm] candidate load:", error?.message);
    return { contactId: null, dialE164: null, contextName: null };
  }

  const dialE164 = pickOutboundE164ForDial(typeof cand.phone === "string" ? cand.phone : null);
  const normEmail = normalizeRecruitingEmail(typeof cand.email === "string" ? cand.email : null);
  const fullName = typeof cand.full_name === "string" ? cand.full_name.trim() : "";
  const contextName = fullName || null;

  const existing =
    typeof cand.crm_contact_id === "string" && UUID_RE.test(cand.crm_contact_id)
      ? cand.crm_contact_id
      : null;

  async function stillLinkedTo(contactId: string): Promise<boolean> {
    if (dialE164) {
      const hit = await findContactByIncomingPhone(supabase, dialE164);
      if (hit?.id === contactId) return true;
    }
    if (normEmail) {
      const hit = await findContactByNormalizedEmail(supabase, normEmail);
      if (hit?.id === contactId) return true;
    }
    return false;
  }

  if (existing) {
    const ok = await stillLinkedTo(existing);
    if (ok) {
      return { contactId: existing, dialE164, contextName };
    }
  }

  let matchId: string | null = null;
  if (dialE164) {
    const byPhone = await findContactByIncomingPhone(supabase, dialE164);
    if (byPhone?.id) matchId = byPhone.id;
  }
  if (!matchId && normEmail) {
    const byEmail = await findContactByNormalizedEmail(supabase, normEmail);
    if (byEmail?.id) matchId = byEmail.id;
  }

  if (matchId) {
    const patch: Record<string, unknown> = { crm_contact_id: matchId };
    const { error: uErr } = await supabase.from("recruiting_candidates").update(patch).eq("id", id);
    if (uErr) {
      console.warn("[recruiting-crm] link candidate to contact:", uErr.message);
    }
    await backfillPrimaryPhoneIfEmpty(supabase, matchId, dialE164);
    await mergeRecruitingMetadata(supabase, matchId, id);
    return { contactId: matchId, dialE164, contextName };
  }

  if (!dialE164 && !normEmail) {
    const { error: clrErr } = await supabase
      .from("recruiting_candidates")
      .update({ crm_contact_id: null })
      .eq("id", id);
    if (clrErr) {
      console.warn("[recruiting-crm] clear crm_contact_id:", clrErr.message);
    }
    return { contactId: null, dialE164: null, contextName };
  }

  const firstName = typeof cand.first_name === "string" ? cand.first_name.trim() || null : null;
  const lastName = typeof cand.last_name === "string" ? cand.last_name.trim() || null : null;
  const city = typeof cand.city === "string" ? cand.city.trim() || null : null;
  const state = typeof cand.state === "string" ? cand.state.trim() || null : null;
  const zip = typeof cand.zip === "string" ? cand.zip.trim() || null : null;
  const emailRaw = typeof cand.email === "string" ? cand.email.trim() || null : null;

  const { data: created, error: insErr } = await supabase
    .from("contacts")
    .insert({
      first_name: firstName,
      last_name: lastName,
      full_name: fullName || "Recruiting candidate",
      primary_phone: dialE164,
      email: emailRaw,
      city,
      state,
      zip,
      contact_type: "other",
      relationship_metadata: { recruiting_candidate_id: id },
    })
    .select("id")
    .maybeSingle();

  if (insErr || !created?.id) {
    console.warn("[recruiting-crm] create contact:", insErr?.message);
    return { contactId: null, dialE164, contextName };
  }

  const newId = String(created.id);
  const { error: linkErr } = await supabase
    .from("recruiting_candidates")
    .update({ crm_contact_id: newId })
    .eq("id", id);
  if (linkErr) {
    console.warn("[recruiting-crm] link new contact:", linkErr.message);
  }

  return { contactId: newId, dialE164, contextName };
}

async function backfillPrimaryPhoneIfEmpty(
  supabase: SupabaseClient,
  contactId: string,
  dialE164: string | null
): Promise<void> {
  if (!dialE164) return;
  const { data: row, error } = await supabase
    .from("contacts")
    .select("primary_phone, secondary_phone")
    .eq("id", contactId)
    .maybeSingle();
  if (error || !row) return;
  const p = typeof row.primary_phone === "string" ? row.primary_phone.trim() : "";
  const s = typeof row.secondary_phone === "string" ? row.secondary_phone.trim() : "";
  if (p || s) return;
  const { error: uErr } = await supabase
    .from("contacts")
    .update({ primary_phone: dialE164 })
    .eq("id", contactId);
  if (uErr) {
    console.warn("[recruiting-crm] backfill primary_phone:", uErr.message);
  }
}

async function mergeRecruitingMetadata(
  supabase: SupabaseClient,
  contactId: string,
  recruitingCandidateId: string
): Promise<void> {
  const { data: row, error } = await supabase
    .from("contacts")
    .select("relationship_metadata")
    .eq("id", contactId)
    .maybeSingle();
  if (error || !row) return;
  const raw = row.relationship_metadata;
  const base =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  if (base.recruiting_candidate_id != null) return;
  const next = { ...base, recruiting_candidate_id: recruitingCandidateId };
  const { error: uErr } = await supabase.from("contacts").update({ relationship_metadata: next }).eq("id", contactId);
  if (uErr) {
    console.warn("[recruiting-crm] merge relationship_metadata:", uErr.message);
  }
}
