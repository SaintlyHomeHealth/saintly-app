import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  ingestFacebookPartnerStandardLead,
  type FacebookPartnerStandardPayload,
} from "@/lib/facebook/facebook-lead-ingestion";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function secretsEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Lowercase keys; spaces → underscores so `full name`, `full_name`, `Full Name` align. */
function canonicalFieldKey(k: string): string {
  return k.trim().toLowerCase().replace(/\s+/g, "_");
}

function normalizeIncomingRecord(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    out[canonicalFieldKey(k)] = v;
  }
  return out;
}

function pickScalarString(norm: Record<string, unknown>, aliases: string[]): string {
  for (const a of aliases) {
    const ck = canonicalFieldKey(a);
    const v = norm[ck];
    if (v === null || v === undefined) continue;
    if (typeof v === "string") {
      const t = v.trim();
      if (t) return t;
    }
    if (typeof v === "number" && Number.isFinite(v)) {
      const t = String(v).trim();
      if (t) return t;
    }
  }
  return "";
}

function pickOptionalUnknown(norm: Record<string, unknown>, aliases: string[]): unknown {
  for (const a of aliases) {
    const ck = canonicalFieldKey(a);
    if (Object.prototype.hasOwnProperty.call(norm, ck) && norm[ck] !== undefined) {
      return norm[ck];
    }
  }
  return undefined;
}

/**
 * Zapier / Facebook Lead Ads → CRM (`ingestFacebookPartnerStandardLead`).
 *
 * Wound care + physical therapy lead forms: normalized keys after alias handling.
 * Auth: header `x-webhook-secret` must match env `FACEBOOK_LEADS_WEBHOOK_SECRET`.
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBodyText);
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } as const, { status: 400 });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ ok: false, error: "invalid_body" } as const, { status: 400 });
  }

  const body = parsed as Record<string, unknown>;
  console.log("Incoming payload:", body);

  const norm = normalizeIncomingRecord(body);

  const fullName = pickScalarString(norm, ["full_name", "full name", "name", "Name"]);
  const phone = pickScalarString(norm, ["phone", "Phone", "phone_number", "phone number", "mobile"]);
  const email = pickScalarString(norm, ["email", "Email"]);
  const formName = pickScalarString(norm, ["form_name", "form name", "Form name"]);
  const hasMedicareRaw = pickOptionalUnknown(norm, ["has_medicare", "Has_Medicare", "has medicare"]);
  const woundType = pickScalarString(norm, ["wound_type", "Wound_Type", "wound type"]);
  const careFor = pickScalarString(norm, ["care_for", "Care_For", "care for"]);
  const zip = pickScalarString(norm, ["zip", "zip_code", "zip code", "postal_code", "postal code"]);
  const notes = pickScalarString(norm, ["notes", "note", "message"]);
  const ptTiming = pickScalarString(norm, ["pt_timing", "pt timing", "Pt_Timing"]);
  const serviceNeeded = pickScalarString(norm, ["service_needed", "service needed", "service", "Service"]);
  const campaign = pickScalarString(norm, ["campaign", "utm_campaign"]);
  const attributionSource = pickScalarString(norm, ["source", "utm_source", "referral_source"]);

  const normalizedLead = {
    full_name: fullName,
    phone,
    email,
    zip_code: zip,
    has_medicare: hasMedicareRaw,
    care_for: careFor,
    pt_timing: ptTiming,
    service_needed: serviceNeeded,
    form_name: formName,
    wound_type: woundType,
    notes,
    campaign,
    attribution_source: attributionSource,
  };
  console.log("Normalized lead:", normalizedLead);

  if (!fullName.trim() && !phone.trim()) {
    return NextResponse.json({ ok: false, error: "missing_name_or_phone" } as const, { status: 400 });
  }

  const payloadForIngest: FacebookPartnerStandardPayload = {
    full_name: fullName || undefined,
    name: fullName || undefined,
    phone: phone || undefined,
    email: email || undefined,
    form_name: formName || undefined,
    has_medicare: hasMedicareRaw,
    wound_type: woundType || undefined,
    care_for: careFor || undefined,
    zip: zip || undefined,
    notes: notes || undefined,
    service_needed: serviceNeeded || undefined,
    service: serviceNeeded || undefined,
    pt_timing: ptTiming || undefined,
    campaign: campaign || undefined,
    source: attributionSource || undefined,
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
      lead_id: result.leadId,
    } as const);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[api/leads/facebook] unhandled", msg);
    return NextResponse.json({ ok: false, error: "internal_error" } as const, { status: 500 });
  }
}
