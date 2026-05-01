import "server-only";

import twilio from "twilio";

import { supabaseAdmin } from "@/lib/admin";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export type PurchaseTwilioNumberResult =
  | { ok: true; id: string | null; phoneNumber: string; twilioSid: string }
  | { ok: false; error: string; status: number; twilioSid?: string; phoneNumber?: string };

/**
 * Ensures we do not double-insert purchased numbers (Twilio may still charge if purchase ran elsewhere).
 */
export async function assertTwilioNumberNotInInventory(normalizedE164: string): Promise<
  { ok: true } | { ok: false; error: string }
> {
  const { data } = await supabaseAdmin
    .from("twilio_phone_numbers")
    .select("id")
    .eq("phone_number", normalizedE164)
    .maybeSingle();
  if (data?.id) {
    return { ok: false, error: "This number is already in Saintly inventory." };
  }
  return { ok: true };
}

/**
 * Purchases an available Twilio number (REST incomingPhoneNumbers.create), wires SMS/voice webhooks,
 * and inserts `twilio_phone_numbers` + assignment audit row.
 */
export async function purchaseTwilioNumberAndSaveToInventory(input: {
  /** E.164 or normalizable US input */
  phoneNumberRaw: string;
  label: string | null;
  /** Defaults to staff_direct */
  numberType?: string;
  assignedByUserId: string;
}): Promise<PurchaseTwilioNumberResult> {
  const raw = input.phoneNumberRaw.trim();
  const normalized =
    normalizeDialInputToE164(raw) ?? (isValidE164(raw) ? raw : "");
  if (!normalized || !isValidE164(normalized)) {
    return { ok: false, error: "Provide a valid E.164 phone number to purchase.", status: 400 };
  }

  const dup = await assertTwilioNumberNotInInventory(normalized);
  if (!dup.ok) {
    return { ok: false, error: dup.error, status: 409 };
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim()?.replace(/\/$/, "");
  if (!accountSid || !authToken || !site) {
    return {
      ok: false,
      error: "Missing TWilio credentials or NEXT_PUBLIC_SITE_URL for webhook URLs.",
      status: 500,
    };
  }

  const smsUrl = `${site}/api/twilio/sms/inbound`;
  const voiceUrl = `${site}/api/twilio/voice/inbound`;
  const numberType =
    typeof input.numberType === "string" && input.numberType.trim()
      ? input.numberType.trim().slice(0, 64)
      : "staff_direct";

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
      return { ok: false, error: "Twilio did not return a phone number SID.", status: 502 };
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("twilio_phone_numbers")
      .insert({
        phone_number: purchased,
        twilio_sid: sid,
        label: input.label,
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
      console.warn("[twilio-purchase] insert:", insErr.message);
      return {
        ok: false,
        error:
          insErr.message ||
          "Twilio purchase succeeded but Saintly could not save the row. Import this number manually.",
        status: 500,
        twilioSid: sid,
        phoneNumber: purchased,
      };
    }

    const newId = inserted?.id ?? null;
    if (newId) {
      await supabaseAdmin.from("twilio_phone_number_assignments").insert({
        phone_number_id: newId,
        assigned_from_user_id: null,
        assigned_to_user_id: null,
        assigned_by_user_id: input.assignedByUserId,
        reason: "purchase",
      });
    }

    return { ok: true, id: newId, phoneNumber: purchased, twilioSid: sid };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[twilio-purchase] twilio:", msg);

    const lowered = msg.toLowerCase();
    if (
      lowered.includes("not available") ||
      lowered.includes("no longer available") ||
      lowered.includes("21452") ||
      lowered.includes("already")
    ) {
      return {
        ok: false,
        error:
          "Twilio reports this number is no longer available. Run search again and pick another number.",
        status: 409,
      };
    }

    return { ok: false, error: msg.slice(0, 800), status: 502 };
  }
}
