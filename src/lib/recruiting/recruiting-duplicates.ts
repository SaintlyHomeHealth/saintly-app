import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeRecruitingEmail,
  normalizeRecruitingPhoneForStorage,
  recruitingNameCityKey,
} from "@/lib/recruiting/recruiting-contact-normalize";

export type RecruitingDuplicateMatchReason = "email" | "phone" | "name_city" | "email_and_phone";

export type RecruitingDuplicateRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  city: string | null;
  status: string | null;
  last_contact_at: string | null;
  reasons: RecruitingDuplicateMatchReason[];
};

type Agg = {
  row: {
    id: string;
    full_name: string;
    phone: string | null;
    email: string | null;
    city: string | null;
    status: string | null;
    last_contact_at: string | null;
  };
  email: boolean;
  phone: boolean;
  nameCity: boolean;
};

function finalizeReasons(a: Agg): RecruitingDuplicateMatchReason[] {
  if (a.email && a.phone) return ["email_and_phone"];
  const out: RecruitingDuplicateMatchReason[] = [];
  if (a.email) out.push("email");
  if (a.phone) out.push("phone");
  if (a.nameCity) out.push("name_city");
  return out;
}

/**
 * Find likely duplicate recruiting candidates (email, phone, or soft name+city).
 * Does not exclude the current row unless excludeId is set (for edits elsewhere).
 */
export async function findRecruitingDuplicateCandidates(
  supabase: SupabaseClient,
  input: {
    email?: string | null;
    phone?: string | null;
    fullName: string;
    city?: string | null;
    excludeId?: string | null;
  }
): Promise<RecruitingDuplicateRow[]> {
  const ne = normalizeRecruitingEmail(input.email ?? null);
  const np = normalizeRecruitingPhoneForStorage(input.phone ?? null);
  const nameCity = recruitingNameCityKey(input.fullName, input.city ?? null);
  const exclude = input.excludeId?.trim() ?? null;

  const selectCols = "id, full_name, phone, email, city, status, last_contact_at";
  const agg = new Map<string, Agg>();

  function bump(
    row: Agg["row"],
    kind: "email" | "phone" | "nameCity"
  ) {
    if (exclude && row.id === exclude) return;
    const prev = agg.get(row.id);
    if (!prev) {
      agg.set(row.id, {
        row,
        email: kind === "email",
        phone: kind === "phone",
        nameCity: kind === "nameCity",
      });
      return;
    }
    if (kind === "email") prev.email = true;
    if (kind === "phone") prev.phone = true;
    if (kind === "nameCity") prev.nameCity = true;
  }

  if (ne) {
    let q = supabase.from("recruiting_candidates").select(selectCols).eq("normalized_email", ne).limit(50);
    if (exclude) q = q.ne("id", exclude);
    const { data, error } = await q;
    if (error) console.warn("[recruiting] duplicate by email:", error.message);
    for (const r of data ?? []) bump(r as Agg["row"], "email");
  }

  if (np) {
    let q = supabase.from("recruiting_candidates").select(selectCols).eq("normalized_phone", np).limit(50);
    if (exclude) q = q.ne("id", exclude);
    const { data, error } = await q;
    if (error) console.warn("[recruiting] duplicate by phone:", error.message);
    for (const r of data ?? []) bump(r as Agg["row"], "phone");
  }

  const softOk = !ne && !np && Boolean(nameCity);
  if (softOk && nameCity) {
    let q = supabase.from("recruiting_candidates").select(selectCols).eq("name_city_key", nameCity).limit(50);
    if (exclude) q = q.ne("id", exclude);
    const { data, error } = await q;
    if (error) console.warn("[recruiting] duplicate by name_city:", error.message);
    for (const r of data ?? []) bump(r as Agg["row"], "nameCity");
  }

  const list: RecruitingDuplicateRow[] = [];
  for (const a of agg.values()) {
    list.push({
      ...a.row,
      reasons: finalizeReasons(a),
    });
  }

  list.sort((a, b) => {
    const score = (r: RecruitingDuplicateRow) =>
      r.reasons[0] === "email_and_phone" ? 0 : r.reasons.includes("email") || r.reasons.includes("phone") ? 1 : 2;
    const s = score(a) - score(b);
    if (s !== 0) return s;
    return (a.full_name || "").localeCompare(b.full_name || "");
  });

  return list;
}

export function describeDuplicateReasons(reasons: RecruitingDuplicateMatchReason[]): string {
  if (reasons.includes("email_and_phone")) return "Email and phone match";
  const parts: string[] = [];
  if (reasons.includes("email")) parts.push("Email match");
  if (reasons.includes("phone")) parts.push("Phone match");
  if (reasons.includes("name_city")) parts.push("Name + city possible duplicate");
  return parts.join(" · ") || "Match";
}

export type RecruitingLeadDuplicateRow = {
  leadId: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  linkedCandidateId: string | null;
  reasons: RecruitingDuplicateMatchReason[];
};

const LEAD_SELECT = "id, full_name, phone, email, status, license_status, lead_type, created_at";

/**
 * Find likely duplicate unified recruiting leads (email, phone, or soft name+role+recent).
 */
export async function findRecruitingDuplicateLeads(
  supabase: SupabaseClient,
  input: {
    email?: string | null;
    phone?: string | null;
    fullName: string;
    discipline?: string | null;
    excludeLeadId?: string | null;
  }
): Promise<RecruitingLeadDuplicateRow[]> {
  const ne = normalizeRecruitingEmail(input.email ?? null);
  const np = normalizeRecruitingPhoneForStorage(input.phone ?? null);
  const exclude = input.excludeLeadId?.trim() ?? null;
  const discipline = input.discipline?.trim().toLowerCase() ?? "";

  type Agg = {
    row: {
      id: string;
      full_name: string;
      phone: string | null;
      email: string | null;
      status: string;
    };
    email: boolean;
    phone: boolean;
    nameRole: boolean;
  };

  const agg = new Map<string, Agg>();

  function bump(row: Agg["row"], kind: "email" | "phone" | "nameRole") {
    if (exclude && row.id === exclude) return;
    const prev = agg.get(row.id);
    if (!prev) {
      agg.set(row.id, { row, email: kind === "email", phone: kind === "phone", nameRole: kind === "nameRole" });
      return;
    }
    if (kind === "email") prev.email = true;
    if (kind === "phone") prev.phone = true;
    if (kind === "nameRole") prev.nameRole = true;
  }

  if (ne) {
    const { data, error } = await supabase
      .from("facebook_recruiting_leads")
      .select(LEAD_SELECT)
      .eq("normalized_email", ne)
      .limit(20);
    if (error) console.warn("[recruiting] lead duplicate by email:", error.message);
    for (const r of data ?? []) bump(r as Agg["row"], "email");
  }

  if (np) {
    const { data, error } = await supabase
      .from("facebook_recruiting_leads")
      .select(LEAD_SELECT)
      .eq("normalized_phone", np)
      .limit(20);
    if (error) console.warn("[recruiting] lead duplicate by phone:", error.message);
    for (const r of data ?? []) bump(r as Agg["row"], "phone");
  }

  const name = input.fullName.trim();
  if (name.length >= 3 && discipline) {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await supabase
      .from("facebook_recruiting_leads")
      .select(LEAD_SELECT)
      .ilike("full_name", name)
      .gte("created_at", since)
      .limit(30);
    if (error) console.warn("[recruiting] lead duplicate by name+role:", error.message);
    for (const r of data ?? []) {
      const row = r as Agg["row"] & { license_status?: string | null; lead_type?: string | null };
      const role = `${row.license_status ?? ""} ${row.lead_type ?? ""}`.trim().toLowerCase();
      if (role.includes(discipline) || discipline.includes(role.split(/\s+/)[0] ?? "")) {
        bump(row, "nameRole");
      }
    }
  }

  const leadIds = [...agg.keys()];
  const linkedByLead = new Map<string, string>();
  if (leadIds.length) {
    const { data: linked } = await supabase
      .from("recruiting_candidates")
      .select("id, recruiting_lead_id")
      .in("recruiting_lead_id", leadIds);
    for (const row of linked ?? []) {
      const leadId = (row as { recruiting_lead_id?: string | null }).recruiting_lead_id;
      const cid = (row as { id: string }).id;
      if (leadId) linkedByLead.set(String(leadId), cid);
    }
  }

  const list: RecruitingLeadDuplicateRow[] = [];
  for (const a of agg.values()) {
    list.push({
      leadId: a.row.id,
      full_name: a.row.full_name,
      phone: a.row.phone,
      email: a.row.email,
      status: a.row.status,
      linkedCandidateId: linkedByLead.get(a.row.id) ?? null,
      reasons: finalizeLeadReasons(a),
    });
  }

  list.sort((a, b) => {
    const score = (r: RecruitingLeadDuplicateRow) =>
      r.reasons[0] === "email_and_phone" ? 0 : r.reasons.includes("email") || r.reasons.includes("phone") ? 1 : 2;
    return score(a) - score(b);
  });

  return list;
}

function finalizeLeadReasons(a: { email: boolean; phone: boolean; nameRole: boolean }): RecruitingDuplicateMatchReason[] {
  if (a.email && a.phone) return ["email_and_phone"];
  const out: RecruitingDuplicateMatchReason[] = [];
  if (a.email) out.push("email");
  if (a.phone) out.push("phone");
  if (a.nameRole) out.push("name_city");
  return out;
}

/** Merge candidate + unified lead duplicate matches for resume/manual create flows. */
export async function findRecruitingUnifiedDuplicates(
  supabase: SupabaseClient,
  input: {
    email?: string | null;
    phone?: string | null;
    fullName: string;
    city?: string | null;
    discipline?: string | null;
    excludeCandidateId?: string | null;
  }
): Promise<{
  candidates: RecruitingDuplicateRow[];
  leads: RecruitingLeadDuplicateRow[];
}> {
  const [candidates, leads] = await Promise.all([
    findRecruitingDuplicateCandidates(supabase, {
      email: input.email,
      phone: input.phone,
      fullName: input.fullName,
      city: input.city,
      excludeId: input.excludeCandidateId,
    }),
    findRecruitingDuplicateLeads(supabase, {
      email: input.email,
      phone: input.phone,
      fullName: input.fullName,
      discipline: input.discipline,
    }),
  ]);
  return { candidates, leads };
}
