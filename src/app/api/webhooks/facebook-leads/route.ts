import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LOG = "[api/webhooks/facebook-leads]";

type FacebookLeadBody = {
  full_name?: unknown;
  phone_number?: unknown;
  email?: unknown;
  city?: unknown;
  who_is_care_needed_for?: unknown;
  what_type_of_help_is_needed?: unknown;
  what_coverage_do_they_have?: unknown;
  tell_us_whats_going_on?: unknown;
  form_name?: unknown;
};

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

  const body = parsed as FacebookLeadBody;
  const fullName = asTrimmedText(body.full_name);
  const phoneRaw = asTrimmedText(body.phone_number);

  if (!fullName) {
    console.warn(LOG, "validation error", { reason: "missing_full_name" });
    return NextResponse.json({ ok: false, error: "missing_full_name" } as const, { status: 400 });
  }

  if (!phoneRaw) {
    console.warn(LOG, "validation error", { reason: "missing_phone_number" });
    return NextResponse.json({ ok: false, error: "missing_phone_number" } as const, { status: 400 });
  }

  const phoneNumber = normalizePhoneNumber(phoneRaw);
  if (!phoneNumber) {
    console.warn(LOG, "validation error", { reason: "invalid_phone_number", phoneRaw });
    return NextResponse.json({ ok: false, error: "invalid_phone_number" } as const, { status: 400 });
  }

  const row = {
    full_name: fullName,
    phone_number: phoneNumber,
    email: optionalText(body.email),
    city: optionalText(body.city),
    who_is_care_needed_for: optionalText(body.who_is_care_needed_for),
    what_type_of_help_is_needed: optionalText(body.what_type_of_help_is_needed),
    what_coverage_do_they_have: optionalText(body.what_coverage_do_they_have),
    tell_us_whats_going_on: optionalText(body.tell_us_whats_going_on),
    form_name: optionalText(body.form_name),
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

    console.log(LOG, "created", { lead_id: data.id, phone_number: phoneNumber, form_name: row.form_name });

    return NextResponse.json({ ok: true, id: data.id } as const);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(LOG, "unhandled", { message });
    return NextResponse.json({ ok: false, error: "internal_error" } as const, { status: 500 });
  }
}
