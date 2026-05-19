import { supabaseAdmin } from "@/lib/admin";
import { contactRowsActiveOnly } from "@/lib/crm/contacts-active";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { normalizePhone } from "@/lib/phone/us-phone-format";

export type SalesAgentDuplicateMatchReason = "phone" | "medicare" | "name_dob";

export type SalesAgentDuplicateHit = {
  leadId: string;
  patientName: string;
  status: string | null;
  matchedBy: SalesAgentDuplicateMatchReason[];
};

function normalizeNameForMatch(raw: string | null | undefined): string {
  return (raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeMedicareForMatch(raw: string | null | undefined): string | null {
  const t = (raw ?? "").trim().replace(/[\s-]/g, "").toUpperCase();
  return t.length >= 4 ? t : null;
}

/**
 * Find likely duplicate CRM leads before a sales agent submits a new order.
 * Does not log Medicare numbers or card data.
 */
export async function findSalesAgentDuplicateLeads(input: {
  phoneE164: string;
  medicareNumber?: string | null;
  patientName?: string | null;
  dobIso?: string | null;
}): Promise<SalesAgentDuplicateHit[]> {
  const phone = normalizePhone(input.phoneE164);
  const medicare = normalizeMedicareForMatch(input.medicareNumber);
  const nameNorm = normalizeNameForMatch(input.patientName);
  const dob = (input.dobIso ?? "").trim().slice(0, 10);

  const hitsByLeadId = new Map<string, SalesAgentDuplicateHit>();

  const addHit = (
    leadId: string,
    patientName: string,
    status: string | null,
    reason: SalesAgentDuplicateMatchReason
  ) => {
    const existing = hitsByLeadId.get(leadId);
    if (existing) {
      if (!existing.matchedBy.includes(reason)) existing.matchedBy.push(reason);
      return;
    }
    hitsByLeadId.set(leadId, { leadId, patientName, status, matchedBy: [reason] });
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
          .select("id, status, contact_id, contacts ( full_name, primary_phone )")
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
          "phone"
        );
      }
    }
  }

  if (medicare) {
    const { data: medicareLeads } = await leadRowsActiveOnly(
      supabaseAdmin
        .from("leads")
        .select("id, status, medicare_number, contacts ( full_name )")
        .not("medicare_number", "is", null)
        .limit(200)
    );

    for (const row of medicareLeads ?? []) {
      const rowMedicare = normalizeMedicareForMatch(
        typeof row.medicare_number === "string" ? row.medicare_number : null
      );
      if (!rowMedicare || rowMedicare !== medicare) continue;
      const cr = row.contacts as { full_name?: string } | { full_name?: string }[] | null;
      const c = Array.isArray(cr) ? cr[0] : cr;
      addHit(
        String(row.id),
        (c?.full_name ?? "").trim() || "Existing lead",
        typeof row.status === "string" ? row.status : null,
        "medicare"
      );
    }
  }

  if (nameNorm && /^\d{4}-\d{2}-\d{2}$/.test(dob)) {
    const { data: dobLeads } = await leadRowsActiveOnly(
      supabaseAdmin
        .from("leads")
        .select("id, status, dob, contacts ( full_name )")
        .eq("dob", dob)
        .limit(100)
    );

    for (const row of dobLeads ?? []) {
      const cr = row.contacts as { full_name?: string } | { full_name?: string }[] | null;
      const c = Array.isArray(cr) ? cr[0] : cr;
      const rowName = normalizeNameForMatch(c?.full_name);
      if (!rowName || rowName !== nameNorm) continue;
      addHit(
        String(row.id),
        (c?.full_name ?? "").trim() || "Existing lead",
        typeof row.status === "string" ? row.status : null,
        "name_dob"
      );
    }
  }

  return [...hitsByLeadId.values()];
}
