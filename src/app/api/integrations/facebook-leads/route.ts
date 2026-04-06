import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  ingestFacebookLeadFromAutomationPayload,
  type AutomationFacebookLeadPayload,
} from "@/lib/facebook/facebook-lead-ingestion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function webhookSecretsEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Facebook Lead Ads → Zapier / Make / external automation → this app.
 *
 * - Method: POST, JSON body (`Content-Type: application/json`).
 * - Auth: header `x-webhook-secret` must equal env `FACEBOOK_LEADS_WEBHOOK_SECRET`.
 * - Dedupes on `leads.external_source_id` = JSON `leadgen_id` (Facebook lead ID), `source` = `facebook`.
 * - Body: `AutomationFacebookLeadPayload` — require `leadgen_id` and either `field_data` (Graph shape)
 *   or `fields` (flat object).
 *
 * Legacy direct Meta webhook (Graph token): `/api/facebook/webhook` — deprecated for this project; prefer this route.
 *
 * Example Zapier payload:
 *
 * ```json
 * {
 *   "leadgen_id": "123",
 *   "fields": {
 *     "full_name": "John Smith",
 *     "email": "john@example.com",
 *     "phone_number": "4805551212"
 *   }
 * }
 * ```
 */
export async function POST(req: NextRequest) {
  const envRaw = process.env.FACEBOOK_LEADS_WEBHOOK_SECRET;
  const expected = envRaw?.trim();
  if (!expected) {
    console.warn("[facebook-leads] error", { reason: "FACEBOOK_LEADS_WEBHOOK_SECRET not configured" });
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  /** Auth reads this exact name (HTTP headers are case-insensitive). */
  const secret = req.headers.get("x-webhook-secret") ?? "";

  // Safe diagnostics — no secret values or substrings logged.
  console.log("[fb-webhook] header exists:", secret.length > 0);
  console.log("[fb-webhook] env exists:", envRaw !== undefined);
  console.log("[fb-webhook] env nonempty after trim:", expected.length > 0);
  console.log("[fb-webhook] receivedLen:", secret.length, "expectedLen:", expected.length);
  console.log(
    "[fb-webhook] match (=== raw header vs raw env):",
    secret === envRaw
  );
  const authOk = webhookSecretsEqual(secret, expected);
  console.log("[fb-webhook] match (timingSafeEqual, actual auth):", authOk);
  console.log(
    "[fb-webhook] would match if header trimmed:",
    !authOk && secret.trim() !== secret && webhookSecretsEqual(secret.trim(), expected)
  );

  if (!authOk) {
    console.warn("[facebook-leads] error", { reason: "unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBodyText: string;
  try {
    rawBodyText = await req.text();
  } catch {
    console.warn("[facebook-leads] error", { reason: "invalid_body" });
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let body: AutomationFacebookLeadPayload;
  try {
    body = JSON.parse(rawBodyText) as AutomationFacebookLeadPayload;
  } catch {
    console.warn("[facebook-leads] error", { reason: "invalid_json" });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await ingestFacebookLeadFromAutomationPayload(supabaseAdmin, {
      webhookPayload: body,
      rawBodyText,
    });

    if (!result.ok) {
      console.warn("[facebook-leads] error", { error: result.error, leadgenId: result.leadgenId });
      return NextResponse.json(
        { ok: false, error: result.error, leadgenId: result.leadgenId },
        { status: 400 }
      );
    }

    if (result.duplicateSkipped) {
      return NextResponse.json({ ok: true, duplicateSkipped: true, leadgenId: result.leadgenId });
    }

    return NextResponse.json({
      ok: true,
      duplicateSkipped: false,
      leadId: result.leadId,
      contactId: result.contactId,
      leadgenId: result.leadgenId,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[facebook-leads] error", { reason: "unhandled", message: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
