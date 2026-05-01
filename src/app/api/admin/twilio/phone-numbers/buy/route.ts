import { NextResponse } from "next/server";
import twilio from "twilio";

import { requireAdminApiSession } from "@/lib/admin/require-admin-api";
import { supabaseAdmin } from "@/lib/admin";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export async function POST(req: Request) {
  const gate = await requireAdminApiSession();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }

  const rawPn = typeof body.phoneNumber === "string" ? body.phoneNumber.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim().slice(0, 200) : null;
  const numberType =
    typeof body.numberType === "string" && body.numberType.trim() ? body.numberType.trim().slice(0, 64) : "staff_direct";

  const normalized = normalizeDialInputToE164(rawPn) ?? (isValidE164(rawPn) ? rawPn : "");
  if (!normalized || !isValidE164(normalized)) {
    return NextResponse.json({ error: "Provide a valid E.164 phoneNumber to purchase." }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "");
  if (!accountSid || !authToken || !site) {
    return NextResponse.json(
      { error: "Missing TWilio credentials or NEXT_PUBLIC_SITE_URL for webhook URLs." },
      { status: 500 }
    );
  }

  const smsUrl = `${site}/api/twilio/sms/inbound`;
  const voiceUrl = `${site}/api/twilio/voice/inbound`;

  try {
    const client = twilio(accountSid, authToken);
    const created = await client.incomingPhoneNumbers.create({
      phoneNumber: normalized,
      smsUrl,
      voiceUrl,
    });

    const sid = typeof created.sid === "string" ? created.sid.trim() : "";
    const purchased =
      typeof created.phoneNumber === "string" && created.phoneNumber.trim()
        ? created.phoneNumber.trim()
        : normalized;
    if (!sid) {
      return NextResponse.json({ error: "Twilio did not return a phone number SID." }, { status: 502 });
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("twilio_phone_numbers")
      .insert({
        phone_number: purchased,
        twilio_sid: sid,
        label,
        number_type: numberType,
        status: "available",
        is_primary_company_number: false,
        is_company_backup_number: false,
        sms_enabled: true,
        voice_enabled: true,
      })
      .select("id")
      .maybeSingle();

    if (insErr) {
      console.warn("[api/admin/twilio/phone-numbers/buy] insert:", insErr.message);
      return NextResponse.json(
        {
          error:
            insErr.message ||
            "Twilio purchase succeeded but Saintly could not save the row. Import this number manually.",
          twilioSid: sid,
          phoneNumber: purchased,
        },
        { status: 500 }
      );
    }

    const newId = inserted?.id;
    if (newId) {
      await supabaseAdmin.from("twilio_phone_number_assignments").insert({
        phone_number_id: newId,
        assigned_from_user_id: null,
        assigned_to_user_id: null,
        assigned_by_user_id: gate.auth.user.id,
        reason: "purchase",
      });
    }

    return NextResponse.json({ ok: true, id: newId, phoneNumber: purchased, twilioSid: sid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[api/admin/twilio/phone-numbers/buy] twilio:", msg);
    return NextResponse.json({ error: msg.slice(0, 800) }, { status: 502 });
  }
}
