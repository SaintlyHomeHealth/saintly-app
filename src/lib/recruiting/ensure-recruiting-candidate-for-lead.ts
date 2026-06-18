import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureRecruitingCandidateCrmContact } from "@/lib/recruiting/recruiting-crm-contact-sync";
import {
  normalizeRecruitingEmail,
  normalizeRecruitingPhoneForStorage,
  recruitingNameCityKey,
} from "@/lib/recruiting/recruiting-contact-normalize";
import { findRecruitingDuplicateCandidates } from "@/lib/recruiting/recruiting-duplicates";
import { recruitingLeadRoleBadge } from "@/lib/recruiting/recruiting-lead-role-display";
import { findRecruitingCandidateIdForLead } from "@/lib/recruiting/recruiting-working-detail-href";

function mapLeadSourceToCandidateSource(source: string | null | undefined): string {
  const s = String(source ?? "").trim().toLowerCase();
  if (s.includes("website") || s.includes("career")) return "Website";
  if (s.includes("referral")) return "Referral";
  if (s.includes("indeed")) return "Indeed";
  return "Other";
}

function mapLeadRoleToDiscipline(input: {
  license_status?: string | null;
  lead_type?: string | null;
  form_name?: string | null;
}): string | null {
  const role = recruitingLeadRoleBadge(input);
  if (role === "Other") return null;
  return role;
}

/**
 * Ensures a recruiting candidate exists for a unified lead before logging CRM activity.
 * Reuses an existing duplicate match when possible — never creates a second candidate.
 */
export async function ensureRecruitingCandidateForLead(
  supabase: SupabaseClient,
  leadId: string
): Promise<{ ok: true; candidateId: string } | { ok: false; error: string }> {
  const id = leadId.trim();
  if (!id) return { ok: false, error: "missing_lead_id" };

  const existing = await findRecruitingCandidateIdForLead(supabase, id);
  if (existing) return { ok: true, candidateId: existing };

  const { data: lead, error: leadErr } = await supabase
    .from("facebook_recruiting_leads")
    .select(
      "id, full_name, phone, email, city, license_status, lead_type, form_name, coverage_area, source, notes"
    )
    .eq("id", id)
    .maybeSingle();

  if (leadErr || !lead?.id) {
    return { ok: false, error: leadErr?.message ?? "lead_not_found" };
  }

  const fullName = String(lead.full_name ?? "").trim() || "Recruiting lead";
  const email = typeof lead.email === "string" ? lead.email.trim() : null;
  const phone = typeof lead.phone === "string" ? lead.phone.trim() : null;
  const city = typeof lead.city === "string" ? lead.city.trim() : null;

  const duplicates = await findRecruitingDuplicateCandidates(supabase, {
    email,
    phone,
    fullName,
    city,
  });

  if (duplicates.length > 0) {
    const dupIds = duplicates.map((d) => d.id);
    const { data: dupRows } = await supabase
      .from("recruiting_candidates")
      .select("id, recruiting_lead_id")
      .in("id", dupIds);

    const safeDup =
      (dupRows ?? []).find(
        (row) =>
          String(row.id) &&
          (row.recruiting_lead_id === id ||
            row.recruiting_lead_id === null ||
            row.recruiting_lead_id === undefined)
      ) ?? null;

    if (safeDup?.id) {
      const dupId = String(safeDup.id);
      if (!safeDup.recruiting_lead_id) {
        const { error: linkErr } = await supabase
          .from("recruiting_candidates")
          .update({ recruiting_lead_id: id })
          .eq("id", dupId)
          .is("recruiting_lead_id", null);

        if (linkErr) {
          console.warn("[recruiting] ensure candidate link duplicate:", linkErr.message);
        }
      }
      return { ok: true, candidateId: dupId };
    }
  }

  const normalizedEmail = email ? normalizeRecruitingEmail(email) : null;
  const normalizedPhone = phone ? normalizeRecruitingPhoneForStorage(phone) : null;
  const nameCityKey = recruitingNameCityKey(fullName, city);

  const { data: inserted, error: insErr } = await supabase
    .from("recruiting_candidates")
    .insert({
      full_name: fullName,
      phone: phone || null,
      email: email && email.includes("@") ? email : null,
      city: city || null,
      coverage_area: typeof lead.coverage_area === "string" ? lead.coverage_area.trim() || null : null,
      discipline: mapLeadRoleToDiscipline({
        license_status: lead.license_status,
        lead_type: lead.lead_type,
        form_name: lead.form_name,
      }),
      source: mapLeadSourceToCandidateSource(lead.source),
      status: "New",
      notes: typeof lead.notes === "string" ? lead.notes.trim() || null : null,
      recruiting_lead_id: id,
      normalized_email: normalizedEmail,
      normalized_phone: normalizedPhone,
      name_city_key: nameCityKey,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !inserted?.id) {
    return { ok: false, error: insErr?.message ?? "candidate_insert_failed" };
  }

  const candidateId = String(inserted.id);
  await ensureRecruitingCandidateCrmContact(supabase, candidateId);
  return { ok: true, candidateId };
}
