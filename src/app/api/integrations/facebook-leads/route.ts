import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  ingestFacebookLeadFromMakePayload,
  type MakeFacebookLeadPayload,
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
 * Facebook Lead Ads → Make.com → this app.
 *
 * - Method: POST, JSON body (`Content-Type: application/json`).
 * - Auth: header `x-webhook-secret` must equal env `FACEBOOK_LEADS_WEBHOOK_SECRET`.
 * - Dedupes on `leads.external_source_id` = JSON `leadgen_id` (Facebook lead ID), `source` = `facebook`.
 * - Body: `MakeFacebookLeadPayload` — require `leadgen_id` and either `field_data` (Graph shape) or `fields` (flat object).
 *
 * Legacy direct Meta webhook (Graph token): `/api/facebook/webhook` — deprecated for this project; prefer this route.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.FACEBOOK_LEADS_WEBHOOK_SECRET?.trim();
  if (!expected) {
    console.warn("[facebook-leads-make] FACEBOOK_LEADS_WEBHOOK_SECRET not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const secret = req.headers.get("x-webhook-secret") ?? "";
  if (!webhookSecretsEqual(secret, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBodyText: string;
  try {
    rawBodyText = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  let body: MakeFacebookLeadPayload;
  try {
    body = JSON.parse(rawBodyText) as MakeFacebookLeadPayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const result = await ingestFacebookLeadFromMakePayload(supabaseAdmin, {
      webhookPayload: body,
      rawBodyText,
    });

    if (!result.ok) {
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
    console.warn("[facebook-leads-make] unhandled", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
