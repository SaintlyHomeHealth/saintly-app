import { NextResponse } from "next/server";

import { normalizeFbclid } from "@/lib/crm/fbclid";
import { supabaseAdmin } from "@/lib/admin";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { ingestWebsiteRecruitingLead } from "@/lib/recruiting/website-recruiting-lead-ingestion";

const MAX_LEN = 8000;

type Body = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  /** Required true (A2P 10DLC): user agreed to SMS terms on employment form. */
  sms_consent?: boolean;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  position?: string;
  license_number?: string;
  years_experience?: string;
  preferred_hours?: string;
  available_start_date?: string;
  experience_message?: string;
  resume_url?: string;
  /** Facebook click id from landing URL. */
  fbclid?: string;
};

function trimStr(v: unknown, max: number): string {
  if (typeof v !== "string") return "";
  const t = v.trim();
  return t.length > max ? t.slice(0, max) : t;
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" } as const, { status: 400 });
  }

  const first_name = trimStr(body.first_name, 120);
  const last_name = trimStr(body.last_name, 120);
  const emailRaw = trimStr(body.email, 320);
  const phoneRaw = trimStr(body.phone, 40);
  const position = trimStr(body.position, 80);

  if (body.sms_consent !== true) {
    return NextResponse.json({ ok: false, error: "sms_consent_required" } as const, { status: 400 });
  }

  if (!first_name || !last_name || !emailRaw || !phoneRaw || !position) {
    return NextResponse.json({ ok: false, error: "validation_required" } as const, { status: 400 });
  }

  const emailNorm = emailRaw.toLowerCase();
  const primary_phone = normalizePhone(phoneRaw);
  if (!primary_phone || primary_phone.length < 10) {
    return NextResponse.json({ ok: false, error: "validation_phone" } as const, { status: 400 });
  }

  const address = trimStr(body.address, 200);
  const city = trimStr(body.city, 120);
  const state = trimStr(body.state, 40);
  const zip = trimStr(body.zip, 20);
  const license_number = trimStr(body.license_number, 120);
  const years_experience = trimStr(body.years_experience, 80);
  const preferred_hours = trimStr(body.preferred_hours, 200);
  const available_start_date = trimStr(body.available_start_date, 80);
  const experience_message = trimStr(body.experience_message, MAX_LEN);
  const resume_url = trimStr(body.resume_url, 2000);
  const fbclid = normalizeFbclid(body.fbclid);

  const full_name = [first_name, last_name].filter(Boolean).join(" ").trim() || null;

  const submittedAt = new Date().toISOString();

  const result = await ingestWebsiteRecruitingLead(supabaseAdmin, {
    first_name,
    last_name,
    full_name: full_name ?? `${first_name} ${last_name}`.trim(),
    email: emailNorm,
    phone: primary_phone,
    city: city || null,
    state: state || null,
    zip: zip || null,
    address: address || null,
    position,
    license_number: license_number || null,
    years_experience: years_experience || null,
    preferred_hours: preferred_hours || null,
    available_start_date: available_start_date || null,
    experience_message: experience_message || null,
    resume_url: resume_url || null,
    fbclid: fbclid ?? null,
    submitted_at: submittedAt,
  });

  if (!result.ok) {
    console.warn("[employment-application] recruiting insert:", result.error);
    return NextResponse.json({ ok: false, error: "server_error" } as const, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    leadId: result.leadId,
    lead_type: "recruiting",
    pipeline: "recruiting",
  } as const);
}
