import type { SupabaseClient } from "@supabase/supabase-js";

import type { CrmContactMatch } from "@/lib/crm/find-contact-by-incoming-phone";
import { normalizeRecruitingEmail } from "@/lib/recruiting/recruiting-contact-normalize";

/**
 * Resolve a CRM contact from a normalized (lowercase trimmed) email.
 * Case-insensitive match on `contacts.email`.
 */
export async function findContactByNormalizedEmail(
  supabase: SupabaseClient,
  raw: string | null | undefined
): Promise<CrmContactMatch | null> {
  const n = normalizeRecruitingEmail(raw);
  if (!n) return null;

  const { data, error } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, full_name, primary_phone, secondary_phone, email, contact_type, status")
    .ilike("email", n)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[crm] findContactByNormalizedEmail:", error.message);
    return null;
  }

  if (!data || typeof data.id !== "string") {
    return null;
  }

  return data as CrmContactMatch;
}
