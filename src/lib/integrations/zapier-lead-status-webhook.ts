import crypto from "crypto";

import { supabaseAdmin } from "@/lib/admin";

function sha256(value: string): string | null {
  if (!value) return null;
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

/**
 * POST JSON to Zapier when lead-relevant status changes. Set `ZAPIER_LEAD_STATUS_WEBHOOK_URL`
 * in the environment to the Catch Hook URL from Zapier.
 *
 * `email` and `phone` are plaintext; they are SHA256-hashed in the request body.
 */
export type ZapierLeadStatusPayload = {
  email: string | null;
  phone: string | null;
  status: string;
  name: string | null;
};

function parseContactFields(data: {
  full_name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  primary_phone?: unknown;
  email?: unknown;
}): { email: string | null; phone: string | null; name: string | null } {
  const fullName = typeof data.full_name === "string" ? data.full_name.trim() : "";
  const first = typeof data.first_name === "string" ? data.first_name.trim() : "";
  const last = typeof data.last_name === "string" ? data.last_name.trim() : "";
  const combined = [first, last].filter(Boolean).join(" ").trim();
  const name = fullName || combined || null;
  return {
    email: typeof data.email === "string" && data.email.trim() !== "" ? data.email.trim() : null,
    phone:
      typeof data.primary_phone === "string" && data.primary_phone.trim() !== ""
        ? data.primary_phone.trim()
        : null,
    name,
  };
}

/** Loads CRM contact fields for a conversation thread (SMS inbox). */
export async function loadContactForZapierByConversation(
  primaryContactId: string | null,
  fallbackPhoneE164: string | null
): Promise<{ email: string | null; phone: string | null; name: string | null }> {
  if (primaryContactId && primaryContactId.trim() !== "") {
    const { data } = await supabaseAdmin
      .from("contacts")
      .select("full_name, first_name, last_name, primary_phone, email")
      .eq("id", primaryContactId)
      .maybeSingle();
    if (data) {
      return parseContactFields(data);
    }
  }
  return {
    email: null,
    phone: fallbackPhoneE164 && fallbackPhoneE164.trim() !== "" ? fallbackPhoneE164.trim() : null,
    name: null,
  };
}

/** Parses `leads` → `contacts` join from Supabase (single object). */
export function contactFieldsFromLeadContactJoin(
  contacts: unknown
): { email: string | null; phone: string | null; name: string | null } {
  if (!contacts || typeof contacts !== "object" || Array.isArray(contacts)) {
    return { email: null, phone: null, name: null };
  }
  return parseContactFields(contacts as Parameters<typeof parseContactFields>[0]);
}

export function notifyZapierLeadStatus(payload: ZapierLeadStatusPayload): void {
  const url = process.env.ZAPIER_LEAD_STATUS_WEBHOOK_URL?.trim();
  if (!url) {
    return;
  }

  void (async () => {
    try {
      const hashedEmail = sha256(payload.email || "");
      const cleanedPhone = (payload.phone || "").replace(/\D/g, "");
      const hashedPhone = sha256(cleanedPhone);
      const body = JSON.stringify({
        email: hashedEmail,
        phone: hashedPhone,
        status: payload.status,
        name: payload.name,
      });
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        console.warn("[zapier-lead-status] webhook non-OK", res.status, t.slice(0, 500));
      }
    } catch (e) {
      console.warn("[zapier-lead-status] webhook error", e);
    }
  })();
}
