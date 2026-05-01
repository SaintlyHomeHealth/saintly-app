import "server-only";

import twilio from "twilio";

import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export type TwilioAvailableNumberHit = {
  phone_number: string;
  national_display: string;
  locality: string | null;
  region: string | null;
  postal_code: string | null;
  capabilities: { voice: boolean; sms: boolean; mms: boolean };
  type: "local" | "toll_free";
};

function mapLocalLikeResource(
  n: {
    phoneNumber?: string | null;
    friendlyName?: string | null;
    locality?: string | null;
    region?: string | null;
    postalCode?: string | null;
    capabilities?: { voice?: boolean; SMS?: boolean; MMS?: boolean } | null;
  },
  type: "local" | "toll_free"
): TwilioAvailableNumberHit | null {
  const pn = typeof n.phoneNumber === "string" ? n.phoneNumber.trim() : "";
  const e164 = normalizeDialInputToE164(pn) ?? (isValidE164(pn) ? pn : "");
  if (!e164 || !isValidE164(e164)) return null;
  const cap = n.capabilities ?? {};
  return {
    phone_number: e164,
    national_display: formatPhoneNumber(e164) || (typeof n.friendlyName === "string" ? n.friendlyName : e164),
    locality: typeof n.locality === "string" && n.locality.trim() ? n.locality.trim() : null,
    region: typeof n.region === "string" && n.region.trim() ? n.region.trim() : null,
    postal_code: typeof n.postalCode === "string" && n.postalCode.trim() ? n.postalCode.trim() : null,
    capabilities: {
      voice: cap.voice === true,
      sms: cap.SMS === true,
      mms: cap.MMS === true,
    },
    type,
  };
}

export type SearchAvailableTwilioNumbersInput = {
  areaCode?: string | null;
  /** Digits or Twilio-style pattern fragment */
  contains?: string | null;
  locality?: string | null;
  /** US state / region code (e.g. AZ) */
  region?: string | null;
  requireSms: boolean;
  requireVoice: boolean;
  requireMms: boolean;
  numberType: "local" | "toll_free";
  limit: number;
};

/**
 * Queries Twilio AvailablePhoneNumbers (US local or toll-free).
 */
export async function searchAvailableTwilioNumbers(
  input: SearchAvailableTwilioNumbersInput
): Promise<{ ok: true; numbers: TwilioAvailableNumberHit[] } | { ok: false; error: string }> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "Missing TWilio credentials." };
  }

  const limit = Math.min(Math.max(input.limit || 30, 1), 50);
  const client = twilio(accountSid, authToken);

  const listOpts: Record<string, string | number | boolean | undefined> = { limit };

  if (input.requireSms) listOpts.smsEnabled = true;
  if (input.requireVoice) listOpts.voiceEnabled = true;
  if (input.requireMms) listOpts.mmsEnabled = true;

  const containsRaw = typeof input.contains === "string" ? input.contains.trim() : "";
  if (containsRaw) {
    const digits = containsRaw.replace(/\D/g, "");
    if (digits.length > 0) {
      listOpts.contains = `*${digits}*`;
    }
  }

  const locality = typeof input.locality === "string" ? input.locality.trim() : "";
  if (locality && input.numberType === "local") {
    listOpts.inLocality = locality.slice(0, 80);
  }

  const region = typeof input.region === "string" ? input.region.trim().toUpperCase() : "";
  if (region && /^[A-Z]{2}$/.test(region) && input.numberType === "local") {
    listOpts.inRegion = region;
  }

  try {
    let rawList: unknown[] = [];

    if (input.numberType === "toll_free") {
      rawList = await client.availablePhoneNumbers("US").tollFree.list(listOpts);
    } else {
      const acRaw = typeof input.areaCode === "string" ? input.areaCode.replace(/\D/g, "").trim() : "";
      const ac = acRaw.length >= 3 ? parseInt(acRaw.slice(0, 3), 10) : 480;
      if (!Number.isFinite(ac) || ac < 200 || ac > 999) {
        return { ok: false, error: "Enter a valid 3-digit US area code (e.g. 480)." };
      }
      listOpts.areaCode = ac;
      rawList = await client.availablePhoneNumbers("US").local.list(listOpts);
    }

    const numbers: TwilioAvailableNumberHit[] = [];
    for (const item of rawList) {
      const mapped = mapLocalLikeResource(
        item as {
          phoneNumber?: string | null;
          friendlyName?: string | null;
          locality?: string | null;
          region?: string | null;
          postalCode?: string | null;
          capabilities?: { voice?: boolean; SMS?: boolean; MMS?: boolean } | null;
        },
        input.numberType
      );
      if (mapped) numbers.push(mapped);
    }

    return { ok: true, numbers };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[twilio-search-available]", msg);
    return { ok: false, error: msg.slice(0, 600) };
  }
}
