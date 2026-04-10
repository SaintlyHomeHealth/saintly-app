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
