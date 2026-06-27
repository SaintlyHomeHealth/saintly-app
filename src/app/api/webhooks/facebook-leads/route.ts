import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  buildLeadFormAnswersFromPayload,
  extractNormalizedLeadContactFields,
  logLeadWebhookSubmission,
} from "@/lib/crm/lead-form-answers";
import { ingestFacebookPartnerStandardLead } from "@/lib/facebook/facebook-lead-ingestion";
import {
  normalizeFacebookPartnerWebhookBody,
  normalizedToPartnerPayload,
} from "@/lib/facebook/facebook-partner-lead-normalize";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOG = "[api/webhooks/facebook-leads]";

function asTrimmedText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function optionalText(value: unknown): string | null {
  const trimmed = asTrimmedText(value);
  return trimmed.length ? trimmed : null;
}

function normalizePhoneNumber(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export async function POST(req: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    console.error(LOG, "server misconfiguration", { reason: "missing_supabase_env" });
    return NextResponse.json({ ok: false, error: "server_misconfiguration" } as const, { status: 500 });
  }

  let rawBodyText: string;
  try {
    rawBodyText = await req.text();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(LOG, "invalid body", { message });
    return NextResponse.json({ ok: false, error: "invalid_body" } as const, { status: 400 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawBodyText);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn(LOG, "invalid json", { message, bodyPreview: rawBodyText.slice(0, 500) });
    return NextResponse.json({ ok: false, error: "invalid_json" } as const, { status: 400 });
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    console.warn(LOG, "invalid body", { bodyType: Array.isArray(parsed) ? "array" : typeof parsed });
    return NextResponse.json({ ok: false, error: "invalid_body" } as const, { status: 400 });
  }

  const body = parsed as Record<string, unknown>;
  logLeadWebhookSubmission(LOG, body);

  const normalizedContact = extractNormalizedLeadContactFields(body);
  const fullName = normalizedContact.name || asTrimmedText(body.full_name);
  const phoneRaw =
    normalizedContact.phone ||
    normalizePhoneNumber(body.phone_number) ||
    normalizePhoneNumber(body.phone);

  if (!fullName) {
    console.warn(LOG, "validation error", { reason: "missing_full_name" });
    return NextResponse.json({ ok: false, error: "missing_full_name" } as const, { status: 400 });
  }

  if (!phoneRaw) {
    console.warn(LOG, "validation error", { reason: "missing_phone_number" });
    return NextResponse.json({ ok: false, error: "missing_phone_number" } as const, { status: 400 });
  }

  const leadFormAnswers = buildLeadFormAnswersFromPayload(body);
  const row = {
    full_name: fullName,
    phone_number: phoneRaw,
    email: optionalText(body.email) ?? (normalizedContact.email || null),
    city: optionalText(body.city) ?? (normalizedContact.city || null),
    who_is_care_needed_for: optionalText(body.who_is_care_needed_for),
    what_type_of_help_is_needed: optionalText(body.what_type_of_help_is_needed),
    what_coverage_do_they_have: optionalText(body.what_coverage_do_they_have),
    tell_us_whats_going_on: optionalText(body.tell_us_whats_going_on),
    form_name: optionalText(body.form_name) ?? (normalizedContact.form_name || null),
    lead_form_answers: leadFormAnswers,
    raw_payload: parsed,
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("facebook_leads")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error(LOG, "insert failed", { error: error.message });
      return NextResponse.json({ ok: false, error: "database_error" } as const, { status: 500 });
    }

    console.log(LOG, "staging row created", {
      staging_id: data.id,
      phone_number: phoneRaw,
      form_name: row.form_name,
      custom_answer_count: leadFormAnswers.length,
    });

    const partnerPayload = normalizedToPartnerPayload(normalizeFacebookPartnerWebhookBody(body));
    const crmResult = await ingestFacebookPartnerStandardLead(supabaseAdmin, {
      payload: partnerPayload,
      rawBodyText,
    });

    if (!crmResult.ok) {
      console.warn(LOG, "crm ingest failed", { staging_id: data.id, error: crmResult.error });
      return NextResponse.json({
        ok: true,
        id: data.id,
        crm_lead_id: null,
        crm_error: crmResult.error,
      } as const);
    }

    console.log(LOG, "crm lead created", {
      staging_id: data.id,
      crm_lead_id: crmResult.leadId,
      contact_id: crmResult.contactId,
    });

    return NextResponse.json({
      ok: true,
      id: data.id,
      crm_lead_id: crmResult.leadId,
    } as const);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(LOG, "unhandled", { message });
    return NextResponse.json({ ok: false, error: "internal_error" } as const, { status: 500 });
  }
}
