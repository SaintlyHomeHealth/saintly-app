import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import {
  normalizeRecruitingEmail,
  normalizeRecruitingPhoneForStorage,
} from "@/lib/recruiting/recruiting-contact-normalize";

export function leadStatusIsActive(status: unknown): boolean {
  const s = typeof status === "string" ? status.trim().toLowerCase() : "";
  if (!s) return true;
  return s !== "converted" && s !== "dead_lead";
}

function normalizeStoredPhone(raw: string | null | undefined): string | null {
  const d = normalizePhone(raw);
  if (!d) return null;
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  if (d.length > 10) return d;
  return null;
}

export async function findContactIdByEmail(
  supabase: SupabaseClient,
  email: string
): Promise<string | null> {
  const e = normalizeRecruitingEmail(email);
  if (!e) return null;
  const { data, error } = await supabase.from("contacts").select("id").ilike("email", e).limit(1);
  if (error) {
    console.warn("[inbound-email] findContactIdByEmail:", error.message);
    return null;
  }
  const id = data?.[0]?.id;
  return typeof id === "string" ? id : null;
}

export async function findContactIdByPhoneDigits(
  supabase: SupabaseClient,
  phoneRaw: string | null | undefined
): Promise<string | null> {
  const d = normalizeRecruitingPhoneForStorage(phoneRaw) ?? normalizeStoredPhone(phoneRaw);
  if (!d) return null;
  const { data, error } = await supabase
    .from("contacts")
    .select("id")
    .or(`primary_phone.eq.${d},secondary_phone.eq.${d}`)
    .limit(1);
  if (error) {
    console.warn("[inbound-email] findContactIdByPhoneDigits:", error.message);
    return null;
  }
  const id = data?.[0]?.id;
  return typeof id === "string" ? id : null;
}

export async function findActiveLeadIdForContact(
  supabase: SupabaseClient,
  contactId: string
): Promise<string | null> {
  const { data, error } = await leadRowsActiveOnly(
    supabase
      .from("leads")
      .select("id, status, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(25)
  );
  if (error) {
    console.warn("[inbound-email] findActiveLeadIdForContact:", error.message);
    return null;
  }
  for (const row of data ?? []) {
    if (row && leadStatusIsActive((row as { status?: string }).status)) {
      return String((row as { id: string }).id);
    }
  }
  return null;
}

export function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(String(err.message ?? ""));
}
