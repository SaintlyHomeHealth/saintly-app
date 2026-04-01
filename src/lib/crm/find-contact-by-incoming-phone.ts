import type { SupabaseClient } from "@supabase/supabase-js";

import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";

export type CrmContactMatch = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  email: string | null;
  contact_type: string | null;
  status: string | null;
};

/**
 * Resolve a CRM contact from an inbound caller ID (Twilio-style E.164 or raw digits).
 * Safe to call from server code with a Supabase client that passes RLS (staff session) or service role.
 */
export async function findContactByIncomingPhone(
  supabase: SupabaseClient,
  raw: string | null | undefined
): Promise<CrmContactMatch | null> {
  const candidates = phoneLookupCandidates(raw);
  if (candidates.length === 0) return null;

  const ors = candidates.flatMap((c) => [`primary_phone.eq.${c}`, `secondary_phone.eq.${c}`]);

  const { data, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, full_name, primary_phone, secondary_phone, email, contact_type, status")
    .or(ors.join(","))
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[crm] findContactByIncomingPhone:", error.message);
    return null;
  }

  if (!data || typeof data.id !== "string") {
    return null;
  }

  return data as CrmContactMatch;
}
