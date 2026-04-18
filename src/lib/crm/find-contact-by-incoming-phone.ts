import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizedPhonesEquivalent } from "@/lib/crm/incoming-caller-lookup";
import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { normalizePhone } from "@/lib/phone/us-phone-format";

export type CrmContactMatch = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  organization_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  email: string | null;
  contact_type: string | null;
  status: string | null;
};

/**
 * NANP-only: matches stored formatted numbers like "(480) 571-2062" where a contiguous last-10
 * substring match fails but area/exchange/last4 appear in order with other characters between.
 */
function nanpLooseDigitIlikePattern(last10: string): string | null {
  if (last10.length !== 10) return null;
  const a = last10.slice(0, 3);
  const b = last10.slice(3, 6);
  const c = last10.slice(6, 10);
  return `%${a}%${b}%${c}%`;
}

/**
 * Resolve a CRM contact from an inbound caller ID (Twilio-style E.164 or raw digits).
 * Safe to call from server code with a Supabase client that passes RLS (staff session) or service role.
 *
 * Uses `phoneLookupCandidates` + optional digit-segment `ilike` so `contacts.primary_phone` values
 * like "(480) 571-2062" match Twilio `From` "+14805712062" (exact `.eq` on E.164 alone misses formatted storage).
 */
export async function findContactByIncomingPhone(
  supabase: SupabaseClient,
  raw: string | null | undefined
): Promise<CrmContactMatch | null> {
  const candidates = phoneLookupCandidates(raw);
  if (candidates.length === 0) return null;

  const digitsKey = normalizePhone(
    typeof raw === "string" && raw.trim() ? raw : candidates.find((c) => c.startsWith("+")) ?? candidates[0] ?? ""
  );

  const eqParts = candidates.flatMap((c) => [`primary_phone.eq.${c}`, `secondary_phone.eq.${c}`]);

  const orParts = [...eqParts];

  if (digitsKey.length >= 10) {
    const last10 = digitsKey.slice(-10);
    const loose = nanpLooseDigitIlikePattern(last10);
    if (loose) {
      orParts.push(`primary_phone.ilike.${loose}`, `secondary_phone.ilike.${loose}`);
    }
    const last10Ilike = `%${last10}%`;
    orParts.push(`primary_phone.ilike.${last10Ilike}`, `secondary_phone.ilike.${last10Ilike}`);
  }

  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, full_name, organization_name, primary_phone, secondary_phone, email, contact_type, status"
    )
    .or(orParts.join(","))
    .limit(40);

  if (error) {
    console.warn("[crm] findContactByIncomingPhone:", error.message);
    return null;
  }

  const rows = (data ?? []) as CrmContactMatch[];
  const match = rows.find(
    (r) =>
      normalizedPhonesEquivalent(r.primary_phone, digitsKey) ||
      normalizedPhonesEquivalent(r.secondary_phone, digitsKey)
  );
  return match ?? null;
}
