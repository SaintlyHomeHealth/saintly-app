import "server-only";

import { revalidatePath } from "next/cache";

import type { SupabaseClient } from "@supabase/supabase-js";

import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  normalizeRecruitingEmail,
  normalizeRecruitingPhoneForStorage,
} from "@/lib/recruiting/recruiting-contact-normalize";
import { normalizeFacebookRecruitingLeadFields } from "@/lib/recruiting/facebook-recruiting-lead-detect";

export type FacebookRecruitingLeadPayload = {
  form_name?: unknown;
  full_name?: unknown;
  phone?: unknown;
  email?: unknown;
  license_status?: unknown;
  home_health_experience?: unknown;
  visits_per_week?: unknown;
  coverage_area?: unknown;
  start_date?: unknown;
  lead_type?: unknown;
  source?: unknown;
  contact_preference?: unknown;
  city?: unknown;
};

export type FacebookRecruitingLeadRawPayload = {
  latest: Record<string, unknown>;
  history: Array<{ received_at: string; payload: Record<string, unknown> }>;
};

function asTrimmedString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" && Number.isFinite(v)) return String(v).trim();
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v).trim();
}

function asNullableEmail(v: unknown): string | null {
  const s = asTrimmedString(v);
  if (!s || !s.includes("@")) return null;
  return s.slice(0, 320);
}

function buildDisplayPhone(rawPhone: string | null, normalizedPhone: string | null): string | null {
  if (rawPhone) return formatPhoneForDisplay(rawPhone) || rawPhone;
  if (normalizedPhone) return formatPhoneForDisplay(normalizedPhone) || normalizedPhone;
  return null;
}

function mergeRawPayload(
  existing: FacebookRecruitingLeadRawPayload | null | undefined,
  incoming: Record<string, unknown>,
  receivedAt: string
): FacebookRecruitingLeadRawPayload {
  const history = Array.isArray(existing?.history) ? [...existing.history] : [];
  if (existing?.latest && typeof existing.latest === "object") {
    history.push({ received_at: receivedAt, payload: existing.latest as Record<string, unknown> });
  }
  return {
    latest: incoming,
    history: history.slice(-20),
  };
}

export type IngestFacebookRecruitingLeadResult =
  | { ok: true; leadId: string; created: boolean }
  | { ok: false; error: string };

export async function ingestFacebookRecruitingLead(
  supabase: SupabaseClient,
  params: { payload: FacebookRecruitingLeadPayload; rawBodyText: string }
): Promise<IngestFacebookRecruitingLeadResult> {
  const parsed = normalizeFacebookRecruitingLeadFields(params.payload as Record<string, unknown>);
  const receivedAt = new Date().toISOString();

  const fullName = parsed.full_name;
  const phoneRaw = parsed.phone ?? "";
  const emailRaw = parsed.email ?? "";

  if (!fullName && !phoneRaw) {
    return { ok: false, error: "missing_name_or_phone" };
  }

  const normalizedPhone = phoneRaw ? normalizeRecruitingPhoneForStorage(phoneRaw) : null;
  const normalizedEmail = emailRaw ? normalizeRecruitingEmail(emailRaw) : null;

  const row = {
    full_name: fullName ?? "Facebook applicant",
    phone: buildDisplayPhone(phoneRaw || null, normalizedPhone),
    email: asNullableEmail(emailRaw),
    city: parsed.city,
    form_name: parsed.form_name,
    license_status: parsed.license_status,
    home_health_experience: parsed.home_health_experience,
    visits_per_week: parsed.visits_per_week,
    coverage_area: parsed.coverage_area,
    start_date: parsed.start_date,
    contact_preference: parsed.contact_preference,
    lead_type: parsed.lead_type,
    source: parsed.source,
    normalized_phone: normalizedPhone,
    normalized_email: normalizedEmail,
  };

  let incomingPayload: Record<string, unknown>;
  try {
    incomingPayload = JSON.parse(params.rawBodyText) as Record<string, unknown>;
  } catch {
    incomingPayload = { ...(params.payload as Record<string, unknown>) };
  }

  let existing:
    | {
        id: string;
        status: string;
        notes: string | null;
        raw_payload: FacebookRecruitingLeadRawPayload | null;
      }
    | null
    | undefined;

  if (normalizedPhone) {
    const { data } = await supabase
      .from("facebook_recruiting_leads")
      .select("id, status, notes, raw_payload")
      .eq("normalized_phone", normalizedPhone)
      .maybeSingle();
    existing = data ?? undefined;
  }

  if (!existing?.id && normalizedEmail) {
    const { data } = await supabase
      .from("facebook_recruiting_leads")
      .select("id, status, notes, raw_payload")
      .eq("normalized_email", normalizedEmail)
      .maybeSingle();
    existing = data ?? undefined;
  }

  const rawPayload = mergeRawPayload(existing?.raw_payload, incomingPayload, receivedAt);

  if (existing?.id) {
    const { error } = await supabase
      .from("facebook_recruiting_leads")
      .update({
        ...row,
        raw_payload: rawPayload,
      })
      .eq("id", existing.id);

    if (error) {
      console.warn("[facebook-recruiting-lead] update failed", { error: error.message, lead_id: existing.id });
      return { ok: false, error: `lead_update_failed:${error.message}` };
    }

    revalidatePath("/admin/recruiting-leads");
    revalidatePath(`/admin/recruiting-leads/${existing.id}`);

    return { ok: true, leadId: existing.id, created: false };
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("facebook_recruiting_leads")
    .insert({
      ...row,
      status: "New",
      raw_payload: rawPayload,
    })
    .select("id")
    .single();

  if (insertErr || !inserted?.id) {
    console.warn("[facebook-recruiting-lead] insert failed", { error: insertErr?.message });
    return { ok: false, error: `lead_insert_failed:${insertErr?.message ?? "unknown"}` };
  }

  revalidatePath("/admin/recruiting-leads");
  revalidatePath(`/admin/recruiting-leads/${inserted.id}`);

  return { ok: true, leadId: String(inserted.id), created: true };
}
