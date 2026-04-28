import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  ingestFacebookPartnerStandardLead,
  type FacebookPartnerStandardPayload,
} from "@/lib/facebook/facebook-lead-ingestion";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secretsEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Accept string or JSON number (e.g. 9167963306) before E.164 normalization. */
function coerceWebhookPhoneRaw(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  if (typeof value === "string") return value.trim();
  return String(value).trim();
}

/**
 * Standardized Facebook partner JSON → CRM (same pipeline as Meta/Zapier ingestion: staff push + SMS intro + inbox).
 *
 * - POST JSON: `name`, `phone`, `email`, `zip`, `notes`, `medicare`, `service`, `source`, `campaign` (extras ignored).
 * - Auth: header `x-webhook-secret` must match env `FACEBOOK_LEADS_WEBHOOK_SECRET` (same as `/api/integrations/facebook-leads`).
 * - `leads.source` = `facebook_ads`; intro SMS creates the thread with `conversations.lead_status` = `new`.
 */
export async function POST(req: NextRequest) {
  const envRaw = process.env.FACEBOOK_LEADS_WEBHOOK_SECRET;
  const expected = envRaw?.trim();
  if (!expected) {
    console.warn("[api/leads/facebook]", { reason: "FACEBOOK_LEADS_WEBHOOK_SECRET not configured" });
    return NextResponse.json({ ok: false, error: "server_misconfiguration" } as const, { status: 500 });
  }

  const secret = (req.headers.get("x-webhook-secret") ?? "").trim();
  if (!secretsEqual(secret, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" } as const, { status: 401 });
  }

  let rawBodyText: string;
  try {
    rawBodyText = await req.text();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_body" } as const, { status: 400 });
  }

  let body: FacebookPartnerStandardPayload;
  try {
    body = JSON.parse(rawBodyText) as FacebookPartnerStandardPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } as const, { status: 400 });
  }

  const rawPhoneForNormalize = coerceWebhookPhoneRaw(body.phone);
  const phoneE164 = normalizeDialInputToE164(rawPhoneForNormalize);
  // Temporary diagnostics — remove after partner launch validation.
  console.log("[api/leads/facebook] phone_normalize", {
    raw_phone: rawPhoneForNormalize,
    normalized_e164: phoneE164,
  });

  const phoneForIngest =
    phoneE164 && isValidE164(phoneE164) ? phoneE164 : rawPhoneForNormalize;

  const payloadForIngest: FacebookPartnerStandardPayload = {
    ...body,
    phone: phoneForIngest,
  };

  try {
    const result = await ingestFacebookPartnerStandardLead(supabaseAdmin, {
      payload: payloadForIngest,
      rawBodyText,
    });

    if (!result.ok) {
      let status = 400;
      if (result.error === "invalid_phone") status = 422;
      return NextResponse.json({ ok: false, error: result.error } as const, { status });
    }

    return NextResponse.json({
      ok: true,
      leadId: result.leadId,
      contactId: result.contactId,
    } as const);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[api/leads/facebook] unhandled", msg);
    return NextResponse.json({ ok: false, error: "internal_error" } as const, { status: 500 });
  }
}
