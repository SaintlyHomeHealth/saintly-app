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
  /** NANP area code when derivable from E.164 (null for non-US-like numbers). */
  area_code: number | null;
  type: "local" | "toll_free";
};

export function nanpAreaCodeFromE164(e164: string): number | null {
  const digits = e164.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    const ac = parseInt(digits.slice(1, 4), 10);
    return Number.isFinite(ac) && ac >= 200 && ac <= 999 ? ac : null;
  }
  if (digits.length === 10) {
    const ac = parseInt(digits.slice(0, 3), 10);
    return Number.isFinite(ac) && ac >= 200 && ac <= 999 ? ac : null;
  }
  return null;
}

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
    area_code: nanpAreaCodeFromE164(e164),
    type,
  };
}

export type SearchAvailableTwilioNumbersInput = {
  areaCode?: string | null;
  /** Local numbers only: run one Twilio query per code and merge (deduped). */
  areaCodes?: number[] | null;
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

function logAdminTwilioSearch(meta: Record<string, unknown>) {
  try {
    console.info("[twilio-admin-search]", JSON.stringify(meta));
  } catch {
    console.info("[twilio-admin-search]", meta);
  }
}

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

  const baseOpts: Record<string, string | number | boolean | undefined> = {};

  if (input.requireSms) baseOpts.smsEnabled = true;
  if (input.requireVoice) baseOpts.voiceEnabled = true;
  if (input.requireMms) baseOpts.mmsEnabled = true;

  const containsRaw = typeof input.contains === "string" ? input.contains.trim() : "";
  let containsPattern: string | undefined;
  if (containsRaw) {
    const digits = containsRaw.replace(/\D/g, "");
    if (digits.length > 0) {
      containsPattern = `*${digits}*`;
      baseOpts.contains = containsPattern;
    }
  }

  const locality = typeof input.locality === "string" ? input.locality.trim() : "";
  if (locality && input.numberType === "local") {
    baseOpts.inLocality = locality.slice(0, 80);
  }

  const region = typeof input.region === "string" ? input.region.trim().toUpperCase() : "";
  if (region && /^[A-Z]{2}$/.test(region) && input.numberType === "local") {
    baseOpts.inRegion = region;
  }

  const normalizedLogBase = {
    numberType: input.numberType,
    requireSms: input.requireSms,
    requireVoice: input.requireVoice,
    requireMms: input.requireMms,
    limit,
    hasContainsPattern: Boolean(containsPattern),
    hasLocality: Boolean(locality && input.numberType === "local"),
    hasRegion: Boolean(region && /^[A-Z]{2}$/.test(region) && input.numberType === "local"),
  };

  try {
    let rawList: unknown[] = [];

    if (input.numberType === "toll_free") {
      const listOpts = { ...baseOpts, limit };
      logAdminTwilioSearch({ ...normalizedLogBase, areaMode: "toll_free" });
      rawList = await client.availablePhoneNumbers("US").tollFree.list(listOpts);
    } else {
      const multiCodes = Array.isArray(input.areaCodes)
        ? [...new Set(input.areaCodes.filter((n) => Number.isFinite(n) && n >= 200 && n <= 999))]
        : [];

      if (multiCodes.length > 0) {
        const perArea = Math.min(50, Math.max(5, Math.ceil(limit / multiCodes.length)));
        const seenPn = new Set<string>();
        const merged: TwilioAvailableNumberHit[] = [];

        logAdminTwilioSearch({
          ...normalizedLogBase,
          areaMode: "local_multi",
          areaCodes: multiCodes,
          perAreaLimit: perArea,
        });

        for (const ac of multiCodes) {
          const listOpts = { ...baseOpts, limit: perArea, areaCode: ac };
          const batch = await client.availablePhoneNumbers("US").local.list(listOpts);
          logAdminTwilioSearch({
            ...normalizedLogBase,
            areaMode: "local_multi_batch",
            areaCode: ac,
            perAreaLimit: perArea,
            twilioBatchCount: batch.length,
          });
          for (const item of batch) {
            const mapped = mapLocalLikeResource(
              item as {
                phoneNumber?: string | null;
                friendlyName?: string | null;
                locality?: string | null;
                region?: string | null;
                postalCode?: string | null;
                capabilities?: { voice?: boolean; SMS?: boolean; MMS?: boolean } | null;
              },
              "local"
            );
            if (mapped && !seenPn.has(mapped.phone_number)) {
              seenPn.add(mapped.phone_number);
              merged.push(mapped);
            }
          }
        }

        merged.sort((a, b) => {
          const acA = a.area_code ?? 999;
          const acB = b.area_code ?? 999;
          if (acA !== acB) return acA - acB;
          return a.phone_number.localeCompare(b.phone_number);
        });

        logAdminTwilioSearch({
          ...normalizedLogBase,
          areaMode: "local_multi",
          areaCodes: multiCodes,
          twilioResultCount: merged.length,
        });

        return { ok: true, numbers: merged };
      }

      const acRaw = typeof input.areaCode === "string" ? input.areaCode.replace(/\D/g, "").trim() : "";
      const ac = acRaw.length >= 3 ? parseInt(acRaw.slice(0, 3), 10) : 480;
      if (!Number.isFinite(ac) || ac < 200 || ac > 999) {
        return { ok: false, error: "Enter a valid 3-digit US area code (e.g. 480)." };
      }

      const listOpts = { ...baseOpts, limit, areaCode: ac };
      logAdminTwilioSearch({
        ...normalizedLogBase,
        areaMode: "local_single",
        areaCode: ac,
      });
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

    numbers.sort((a, b) => {
      const acA = a.area_code ?? 999;
      const acB = b.area_code ?? 999;
      if (acA !== acB) return acA - acB;
      return a.phone_number.localeCompare(b.phone_number);
    });

    logAdminTwilioSearch({
      ...normalizedLogBase,
      areaMode: input.numberType === "toll_free" ? "toll_free" : "local_single",
      twilioResultCount: numbers.length,
    });

    return { ok: true, numbers };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[twilio-search-available]", msg);
    logAdminTwilioSearch({
      ...normalizedLogBase,
      twilioError: true,
      twilioResultCount: 0,
      messagePreview: msg.slice(0, 200),
    });
    return { ok: false, error: msg.slice(0, 600) };
  }
}
