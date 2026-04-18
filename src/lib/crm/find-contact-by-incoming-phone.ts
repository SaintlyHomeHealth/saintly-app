import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizedPhonesEquivalent } from "@/lib/crm/incoming-caller-lookup";
import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { buildPhoneColumnOrFilter } from "@/lib/crm/phone-supabase-match";
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

  const keyForFilter =
    typeof raw === "string" && raw.trim() ? raw : candidates.find((c) => c.startsWith("+")) ?? candidates[0] ?? "";
  const orFilter = buildPhoneColumnOrFilter(["primary_phone", "secondary_phone"], keyForFilter);
  if (!orFilter) return null;

  const { data, error } = await supabase
    .from("contacts")
    .select(
      "id, first_name, last_name, full_name, organization_name, primary_phone, secondary_phone, email, contact_type, status"
    )
    .or(orFilter)
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
