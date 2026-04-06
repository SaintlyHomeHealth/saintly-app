import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  ingestFacebookLeadFromWebhookPayload,
  type MetaWebhookBody,
} from "@/lib/facebook/facebook-lead-ingestion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Direct Meta Lead Ads webhook (Facebook → this app). **Deprecated for Saintly ops:** ingestion is
 * expected via Zapier / Make / external automation → `POST /api/integrations/facebook-leads`
 * (`FACEBOOK_LEADS_WEBHOOK_SECRET`).
 * This route remains for backward compatibility if env tokens are still configured.
 *
 * Env:
 * - FACEBOOK_VERIFY_TOKEN — subscription verification (GET hub.verify_token)
 * - FACEBOOK_PAGE_ACCESS_TOKEN — Graph API token to read lead by leadgen_id
 * - FACEBOOK_GRAPH_API_VERSION — optional (default v21.0), used by ingestion helper
 */

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");
  const expected = process.env.FACEBOOK_VERIFY_TOKEN?.trim();

  if (mode === "subscribe" && expected && token === expected && challenge) {
    console.log("[facebook-webhook] verification ok");
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  console.warn("[facebook-webhook] verification failed", {
    has_expected: Boolean(expected),
    mode_match: mode === "subscribe",
    token_match: Boolean(expected && token === expected),
    has_challenge: Boolean(challenge),
  });
  return new NextResponse("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const pageToken = process.env.FACEBOOK_PAGE_ACCESS_TOKEN?.trim();
  if (!pageToken) {
    console.warn("[facebook-webhook] FACEBOOK_PAGE_ACCESS_TOKEN not configured");
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  let rawBodyText: string;
  try {
    rawBodyText = await req.text();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  console.log("[facebook-webhook] received", { bytes: rawBodyText.length });

  let body: MetaWebhookBody;
  try {
    body = JSON.parse(rawBodyText) as MetaWebhookBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const results = await ingestFacebookLeadFromWebhookPayload(supabaseAdmin, {
      webhookPayload: body,
      rawBodyText,
      pageAccessToken: pageToken,
    });

    if (results.length === 1 && results[0].ok === false && results[0].error === "ignored_object_not_page") {
      return NextResponse.json({ ok: true, ignored: true, reason: "object_not_page" });
    }

    if (results.length === 0) {
      return NextResponse.json({ ok: true, processed: 0, message: "no_leadgen_changes" });
    }

    const anyFailure = results.some((r) => r.ok === false);
    if (anyFailure) {
      console.warn("[facebook-webhook] processing failure", { results });
      return NextResponse.json({ ok: false, results }, { status: 500 });
    }

    return NextResponse.json({ ok: true, results });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[facebook-webhook] unhandled", { error: msg });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
