import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { ingestFacebookPartnerStandardLead } from "@/lib/facebook/facebook-lead-ingestion";
import {
  FACEBOOK_WOUND_CARE_ZAPIER_EXAMPLE_PAYLOAD,
  normalizeFacebookPartnerWebhookBody,
  normalizedToPartnerPayload,
} from "@/lib/facebook/facebook-partner-lead-normalize";
import {
  ingestFacebookRecruitingLead,
  type FacebookRecruitingLeadPayload,
} from "@/lib/recruiting/facebook-recruiting-lead-ingestion";
import { isFacebookRecruitingLeadPayload } from "@/lib/recruiting/facebook-recruiting-lead-detect";
import { logLeadWebhookSubmission } from "@/lib/crm/lead-form-answers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secretsEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Zapier / Facebook Lead Ads → CRM (`ingestFacebookPartnerStandardLead`).
 *
 * Auth: header `x-webhook-secret` must match env `FACEBOOK_LEADS_WEBHOOK_SECRET`.
 *
 * Example Zapier POST body (wound care):
 *
 * ```json
 * {
 *   "full_name": "Jane Doe",
 *   "phone_number": "4805551234",
 *   "email": "test@example.com",
 *   "city": "Mesa",
 *   "insurance_answer": "Medicare",
 *   "wound_care_needed": "Open wound / pressure sore",
 *   "care_for": "My parent",
 *   "source": "Facebook Wound Care Ad",
 *   "lead_type": "wound_care"
 * }
 * ```
 *
 * See also `FACEBOOK_WOUND_CARE_ZAPIER_EXAMPLE_PAYLOAD` in `facebook-partner-lead-normalize.ts`.
 */
export async function POST(req: NextRequest) {
  const envRaw = process.env.FACEBOOK_LEADS_WEBHOOK_SECRET;
  const expected = envRaw?.trim();
  if (!expected) {
    console.warn("[api/leads/facebook] error", { reason: "FACEBOOK_LEADS_WEBHOOK_SECRET not configured" });
    return NextResponse.json({ ok: false, error: "server_misconfiguration" } as const, { status: 500 });
  }

  const secret = (req.headers.get("x-webhook-secret") ?? "").trim();
  if (!secretsEqual(secret, expected)) {
    console.warn("[api/leads/facebook] error", { reason: "unauthorized" });
    return NextResponse.json({ ok: false, error: "unauthorized" } as const, { status: 401 });
  }

  let rawBodyText: string;
  try {
    rawBodyText = await req.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[api/leads/facebook] error", { reason: "invalid_body", message: msg });
    return NextResponse.json({ ok: false, error: "invalid_body" } as const, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBodyText);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[api/leads/facebook] error", { reason: "invalid_json", message: msg, bodyPreview: rawBodyText.slice(0, 500) });
    return NextResponse.json({ ok: false, error: "invalid_json" } as const, { status: 400 });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn("[api/leads/facebook] error", { reason: "invalid_body", bodyType: Array.isArray(parsed) ? "array" : typeof parsed });
    return NextResponse.json({ ok: false, error: "invalid_body" } as const, { status: 400 });
  }

  const body = parsed as Record<string, unknown>;
  logLeadWebhookSubmission("[api/leads/facebook]", body);
  const normalizedLead = normalizeFacebookPartnerWebhookBody(body);
  console.log("[api/leads/facebook] normalized", normalizedLead);

  if (!normalizedLead.full_name.trim() && !normalizedLead.phone.trim()) {
    console.warn("[api/leads/facebook] error", {
      reason: "missing_name_or_phone",
      example: FACEBOOK_WOUND_CARE_ZAPIER_EXAMPLE_PAYLOAD,
    });
    return NextResponse.json({ ok: false, error: "missing_name_or_phone" } as const, { status: 400 });
  }

  const recruitingPayload: FacebookRecruitingLeadPayload = {
    form_name: normalizedLead.form_name || undefined,
    full_name: normalizedLead.full_name || undefined,
    phone: normalizedLead.phone || undefined,
    email: normalizedLead.email || undefined,
    license_status: normalizedLead.license_status || undefined,
    home_health_experience: normalizedLead.home_health_experience || undefined,
    visits_per_week: normalizedLead.visits_per_week || undefined,
    coverage_area: normalizedLead.coverage_area || undefined,
    start_date: normalizedLead.start_date || undefined,
    lead_type: normalizedLead.lead_type || undefined,
    source: normalizedLead.source || undefined,
    contact_preference: normalizedLead.contact_preference || undefined,
    city: normalizedLead.city || undefined,
  };

  if (isFacebookRecruitingLeadPayload(recruitingPayload as Record<string, unknown>)) {
    try {
      const recruitingResult = await ingestFacebookRecruitingLead(supabaseAdmin, {
        payload: recruitingPayload,
        rawBodyText,
      });

      if (!recruitingResult.ok) {
        console.warn("[api/leads/facebook] recruiting error", { error: recruitingResult.error, normalizedLead });
        return NextResponse.json({ ok: false, error: recruitingResult.error } as const, { status: 400 });
      }

      return NextResponse.json({
        ok: true,
        lead_id: recruitingResult.leadId,
        lead_type: "recruiting",
        sms_sent: recruitingResult.sms_sent,
        admin_notification_sent: recruitingResult.admin_notification_sent,
        admin_sms_alert_sent: recruitingResult.admin_sms_alert_sent,
      } as const);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[api/leads/facebook] recruiting unhandled", { message: msg, normalizedLead });
      return NextResponse.json({ ok: false, error: "internal_error" } as const, { status: 500 });
    }
  }

  const payloadForIngest = normalizedToPartnerPayload(normalizedLead);

  try {
    const result = await ingestFacebookPartnerStandardLead(supabaseAdmin, {
      payload: payloadForIngest,
      rawBodyText,
    });

    if (!result.ok) {
      let status = 400;
      if (result.error === "invalid_phone") status = 422;
      console.warn("[api/leads/facebook] ingest error", {
        error: result.error,
        normalizedLead,
        bodyPreview: rawBodyText.slice(0, 1000),
      });
      return NextResponse.json({ ok: false, error: result.error } as const, { status });
    }

    return NextResponse.json({
      ok: true,
      lead_id: result.leadId,
    } as const);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[api/leads/facebook] unhandled", { message: msg, normalizedLead, bodyPreview: rawBodyText.slice(0, 1000) });
    return NextResponse.json({ ok: false, error: "internal_error" } as const, { status: 500 });
  }
}
