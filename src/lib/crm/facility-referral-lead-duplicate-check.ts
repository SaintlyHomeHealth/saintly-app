import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import type { FacilityReferralDuplicateHit } from "@/lib/crm/facility-referral-lead-types";
import { normalizePhone } from "@/lib/phone/us-phone-format";

function normalizeNameForMatch(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

export async function findFacilityReferralDuplicateLeads(input: {
  phoneE164?: string | null;
  patientFirstName?: string | null;
  patientLastName?: string | null;
  dobIso?: string | null;
  facilityId?: string | null;
}): Promise<FacilityReferralDuplicateHit[]> {
  const phone = normalizePhone(input.phoneE164 ?? "");
  const first = normalizeNameForMatch(input.patientFirstName);
  const last = normalizeNameForMatch(input.patientLastName);
  const fullName = normalizeNameForMatch([input.patientFirstName, input.patientLastName].filter(Boolean).join(" "));
  const dob = (input.dobIso ?? "").trim().slice(0, 10);
  const facilityId = (input.facilityId ?? "").trim();

  const hitsByLeadId = new Map<string, FacilityReferralDuplicateHit>();

  const addHit = (leadId: string, patientName: string, status: string | null, reason: string, createdAt: string | null) => {
    const existing = hitsByLeadId.get(leadId);
    if (existing) {
      if (!existing.matched_by.includes(reason)) existing.matched_by.push(reason);
      return;
    }
    hitsByLeadId.set(leadId, {
      lead_id: leadId,
      patient_name: patientName,
      status,
      matched_by: [reason],
      created_at: createdAt,
    });
  };

  if (phone.length >= 10) {
    const tail = phone.slice(-10);
    const { data: contacts } = await contactRowsActiveOnly(
      supabaseAdmin
        .from("contacts")
        .select("id, full_name, primary_phone")
        .ilike("primary_phone", `%${tail}%`)
        .limit(50)
    );

    const contactIds = (contacts ?? []).map((c) => c.id as string).filter(Boolean);
    if (contactIds.length > 0) {
      const { data: leads } = await leadRowsActiveOnly(
        supabaseAdmin
          .from("leads")
          .select("id, status, created_at, contact_id, contacts ( full_name, primary_phone )")
          .in("contact_id", contactIds)
          .limit(50)
      );

      for (const row of leads ?? []) {
        const cr = row.contacts as { full_name?: string; primary_phone?: string } | { full_name?: string; primary_phone?: string }[] | null;
        const c = Array.isArray(cr) ? cr[0] : cr;
        const rowPhone = normalizePhone(c?.primary_phone ?? "");
        if (rowPhone !== phone) continue;
        addHit(
          String(row.id),
          (c?.full_name ?? "").trim() || "Existing lead",
          typeof row.status === "string" ? row.status : null,
          "phone",
          typeof row.created_at === "string" ? row.created_at : null
        );
      }
    }
  }

  if (fullName && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const { data: dobLeads } = await leadRowsActiveOnly(
      supabaseAdmin
        .from("leads")
        .select("id, status, created_at, dob, contacts ( full_name )")
        .eq("dob", dob)
        .limit(100)
    );

    for (const row of dobLeads ?? []) {
      const cr = row.contacts as { full_name?: string } | { full_name?: string }[] | null;
      const c = Array.isArray(cr) ? cr[0] : cr;
      const rowName = normalizeNameForMatch(c?.full_name);
      if (!rowName || rowName !== fullName) continue;
      addHit(
        String(row.id),
        (c?.full_name ?? "").trim() || "Existing lead",
        typeof row.status === "string" ? row.status : null,
        "name_dob",
        typeof row.created_at === "string" ? row.created_at : null
      );
    }
  }

  if (facilityId && fullName) {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { data: facilityLeads } = await leadRowsActiveOnly(
      supabaseAdmin
        .from("leads")
        .select("id, status, created_at, contacts ( full_name )")
        .eq("referring_facility_id", facilityId)
        .gte("created_at", since)
        .limit(100)
    );

    for (const row of facilityLeads ?? []) {
      const cr = row.contacts as { full_name?: string } | { full_name?: string }[] | null;
      const c = Array.isArray(cr) ? cr[0] : cr;
      const rowName = normalizeNameForMatch(c?.full_name);
      if (!rowName) continue;
      if (rowName !== fullName && !(first && last && rowName.includes(first) && rowName.includes(last))) continue;
      addHit(
        String(row.id),
        (c?.full_name ?? "").trim() || "Existing lead",
        typeof row.status === "string" ? row.status : null,
        "name_facility",
        typeof row.created_at === "string" ? row.created_at : null
      );
    }
  }

  if (facilityId) {
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentFacilityLeads } = await leadRowsActiveOnly(
      supabaseAdmin
        .from("leads")
        .select("id, status, created_at, contacts ( full_name )")
        .eq("referring_facility_id", facilityId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(20)
    );

    for (const row of recentFacilityLeads ?? []) {
      const cr = row.contacts as { full_name?: string } | { full_name?: string }[] | null;
      const c = Array.isArray(cr) ? cr[0] : cr;
      const rowName = normalizeNameForMatch(c?.full_name);
      if (fullName && rowName && rowName === fullName) {
        addHit(
          String(row.id),
          (c?.full_name ?? "").trim() || "Existing lead",
          typeof row.status === "string" ? row.status : null,
          "recent_facility",
          typeof row.created_at === "string" ? row.created_at : null
        );
      }
    }
  }

  return [...hitsByLeadId.values()];
}
