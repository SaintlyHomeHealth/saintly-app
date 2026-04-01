import type { SupabaseClient } from "@supabase/supabase-js";

/** Minimal CRM block for call UI; `phone_calls.contact_id` is authoritative. */
export type PhoneCallCrmContext = {
  contactId: string | null;
  displayName: string | null;
  primaryPhone: string | null;
  email: string | null;
  contactType: string | null;
};

export async function loadCrmContextForPhoneCall(
  supabase: SupabaseClient,
  contactId: string | null
): Promise<PhoneCallCrmContext> {
  if (!contactId?.trim()) {
    return {
      contactId: null,
      displayName: null,
      primaryPhone: null,
      email: null,
      contactType: null,
    };
  }

  const { data, error } = await supabase
    .from("contacts")
    .select("id, full_name, first_name, last_name, primary_phone, email, contact_type")
    .eq("id", contactId)
    .maybeSingle();

  if (error || !data?.id) {
    return {
      contactId,
      displayName: null,
      primaryPhone: null,
      email: null,
      contactType: null,
    };
  }

  const fn = typeof data.full_name === "string" ? data.full_name.trim() : "";
  const parts = [data.first_name, data.last_name].filter(Boolean).join(" ").trim();
  const displayName = fn || parts || null;

  return {
    contactId: String(data.id),
    displayName,
    primaryPhone: typeof data.primary_phone === "string" ? data.primary_phone : null,
    email: typeof data.email === "string" ? data.email : null,
    contactType: typeof data.contact_type === "string" ? data.contact_type : null,
  };
}
