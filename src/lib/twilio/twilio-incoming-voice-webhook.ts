import "server-only";

import twilio from "twilio";

import { resolveTwilioWebhookBaseUrl } from "@/lib/twilio/signature-url";

/** Production Voice webhook path for staff DIDs and company lines. */
export const TWILIO_INBOUND_RING_VOICE_PATH = "/api/twilio/voice/inbound-ring";

export type TwilioVoiceWebhookIssue = "ok" | "missing" | "demo" | "wrong" | "expected_url_unset";

export type TwilioVoiceWebhookAssessment = {
  issue: TwilioVoiceWebhookIssue;
  expectedUrl: string | null;
  actualUrl: string | null;
};

function normalizeWebhookUrl(url: string): string {
  return url.trim().replace(/\/$/, "").toLowerCase();
}

/**
 * Canonical inbound-ring Voice URL written to Twilio (POST).
 * Prefers TWILIO_WEBHOOK_BASE_URL / TWILIO_PUBLIC_BASE_URL, then NEXT_PUBLIC_SITE_URL.
 */
export function resolveTwilioInboundRingVoiceWebhookUrl(): string | null {
  const base =
    resolveTwilioWebhookBaseUrl() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    "";
  if (!base) return null;
  return `${base}${TWILIO_INBOUND_RING_VOICE_PATH}`;
}

/**
 * Inventory rows that must ring through Saintly inbound voice routing.
 */
export function twilioPhoneNumberRowRequiresInboundRingVoiceWebhook(row: {
  number_type?: string | null;
  is_primary_company_number?: boolean;
  is_company_backup_number?: boolean;
}): boolean {
  const nt = typeof row.number_type === "string" ? row.number_type.trim().toLowerCase() : "";
  if (nt === "staff_direct" || nt === "backup_shared" || nt === "primary_company") {
    return true;
  }
  if (row.is_primary_company_number === true || row.is_company_backup_number === true) {
    return true;
  }
  if (nt === "company_shared") {
    return true;
  }
  return false;
}

export function assessTwilioInboundRingVoiceWebhook(
  actualVoiceUrl: string | null | undefined,
  expectedUrl: string | null = resolveTwilioInboundRingVoiceWebhookUrl()
): TwilioVoiceWebhookAssessment {
  const actual = typeof actualVoiceUrl === "string" ? actualVoiceUrl.trim() : "";
  const expected = expectedUrl?.trim() ?? "";

  if (!actual) {
    return { issue: "missing", expectedUrl: expected || null, actualUrl: null };
  }
  if (actual.toLowerCase().includes("demo.twilio.com")) {
    return { issue: "demo", expectedUrl: expected || null, actualUrl: actual };
  }
  if (!expected) {
    return { issue: "expected_url_unset", expectedUrl: null, actualUrl: actual };
  }
  if (normalizeWebhookUrl(actual) !== normalizeWebhookUrl(expected)) {
    return { issue: "wrong", expectedUrl: expected, actualUrl: actual };
  }
  return { issue: "ok", expectedUrl: expected, actualUrl: actual };
}

export function isTwilioInboundRingVoiceWebhookMisconfigured(
  actualVoiceUrl: string | null | undefined,
  expectedUrl?: string | null
): boolean {
  return assessTwilioInboundRingVoiceWebhook(actualVoiceUrl, expectedUrl ?? undefined).issue !== "ok";
}

function twilioRestClient(): twilio.Twilio | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) return null;
  return twilio(accountSid, authToken);
}

export type TwilioIncomingVoiceWebhookSnapshot = {
  voiceUrl: string | null;
  voiceMethod: string | null;
};

/**
 * Lists Twilio IncomingPhoneNumbers once and maps by Phone Number SID.
 */
export async function fetchTwilioIncomingVoiceWebhooksBySid(): Promise<
  Map<string, TwilioIncomingVoiceWebhookSnapshot>
> {
  const client = twilioRestClient();
  const out = new Map<string, TwilioIncomingVoiceWebhookSnapshot>();
  if (!client) return out;

  const nums = await client.incomingPhoneNumbers.list({ pageSize: 1000 });
  for (const n of nums) {
    const sid = typeof n.sid === "string" ? n.sid.trim() : "";
    if (!sid) continue;
    const voiceUrl =
      typeof n.voiceUrl === "string" && n.voiceUrl.trim() ? n.voiceUrl.trim() : null;
    const voiceMethod =
      typeof n.voiceMethod === "string" && n.voiceMethod.trim() ? n.voiceMethod.trim() : null;
    out.set(sid, { voiceUrl, voiceMethod });
  }
  return out;
}

export type EnsureTwilioInboundRingVoiceWebhookResult =
  | { ok: true; updated: boolean; voiceUrl: string }
  | { ok: false; error: string };

/**
 * Sets Voice webhook to inbound-ring (POST). Does not modify SMS / Messaging Service config.
 */
export async function ensureTwilioInboundRingVoiceWebhook(input: {
  twilioSid: string;
}): Promise<EnsureTwilioInboundRingVoiceWebhookResult> {
  const sid = input.twilioSid.trim();
  if (!sid) {
    return { ok: false, error: "Missing Twilio phone number SID." };
  }

  const voiceUrl = resolveTwilioInboundRingVoiceWebhookUrl();
  if (!voiceUrl) {
    return {
      ok: false,
      error:
        "Missing TWILIO_WEBHOOK_BASE_URL, TWILIO_PUBLIC_BASE_URL, or NEXT_PUBLIC_SITE_URL for Voice webhook URL.",
    };
  }

  const client = twilioRestClient();
  if (!client) {
    return { ok: false, error: "Missing TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN." };
  }

  try {
    const current = await client.incomingPhoneNumbers(sid).fetch();
    const currentUrl =
      typeof current.voiceUrl === "string" && current.voiceUrl.trim() ? current.voiceUrl.trim() : "";
    const currentMethod =
      typeof current.voiceMethod === "string" && current.voiceMethod.trim()
        ? current.voiceMethod.trim().toUpperCase()
        : "";

    const assessment = assessTwilioInboundRingVoiceWebhook(currentUrl, voiceUrl);
    if (assessment.issue === "ok" && currentMethod === "POST") {
      return { ok: true, updated: false, voiceUrl };
    }

    await client.incomingPhoneNumbers(sid).update({
      voiceUrl,
      voiceMethod: "POST",
    });

    return { ok: true, updated: true, voiceUrl };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[twilio-incoming-voice-webhook] ensure:", msg, { sid });
    return { ok: false, error: msg.slice(0, 800) };
  }
}

export type RepairInventoryVoiceWebhooksResult = {
  checked: number;
  repaired: number;
  skipped: number;
  errors: string[];
};

/**
 * Ensures inbound-ring Voice webhooks for inventory rows that require them and have Voice enabled.
 */
export async function repairTwilioInboundRingVoiceWebhooksForInventory(
  rows: Array<{
    id: string;
    twilio_sid: string;
    voice_enabled: boolean;
    number_type: string;
    is_primary_company_number: boolean;
    is_company_backup_number: boolean;
  }>
): Promise<RepairInventoryVoiceWebhooksResult> {
  const result: RepairInventoryVoiceWebhooksResult = {
    checked: 0,
    repaired: 0,
    skipped: 0,
    errors: [],
  };

  for (const row of rows) {
    if (row.voice_enabled === false) {
      result.skipped += 1;
      continue;
    }
    if (
      !twilioPhoneNumberRowRequiresInboundRingVoiceWebhook({
        number_type: row.number_type,
        is_primary_company_number: row.is_primary_company_number,
        is_company_backup_number: row.is_company_backup_number,
      })
    ) {
      result.skipped += 1;
      continue;
    }

    const sid = typeof row.twilio_sid === "string" ? row.twilio_sid.trim() : "";
    if (!sid) {
      result.skipped += 1;
      continue;
    }

    result.checked += 1;
    const ensured = await ensureTwilioInboundRingVoiceWebhook({ twilioSid: sid });
    if (!ensured.ok) {
      result.errors.push(`${row.id}: ${ensured.error}`);
      continue;
    }
    if (ensured.updated) {
      result.repaired += 1;
    }
  }

  return result;
}

export type TwilioPhoneNumberVoiceWebhookStatus = {
  twilio_voice_url: string | null;
  twilio_voice_method: string | null;
  twilio_voice_webhook_issue: TwilioVoiceWebhookIssue;
  twilio_voice_webhook_ok: boolean;
  expected_voice_webhook_url: string | null;
};

export function buildTwilioPhoneNumberVoiceWebhookStatus(
  row: {
    voice_enabled: boolean;
    number_type: string;
    is_primary_company_number: boolean;
    is_company_backup_number: boolean;
  },
  snapshot: TwilioIncomingVoiceWebhookSnapshot | null | undefined
): TwilioPhoneNumberVoiceWebhookStatus {
  const expected = resolveTwilioInboundRingVoiceWebhookUrl();
  const requires =
    row.voice_enabled !== false &&
    twilioPhoneNumberRowRequiresInboundRingVoiceWebhook({
      number_type: row.number_type,
      is_primary_company_number: row.is_primary_company_number,
      is_company_backup_number: row.is_company_backup_number,
    });

  if (!requires) {
    return {
      twilio_voice_url: snapshot?.voiceUrl ?? null,
      twilio_voice_method: snapshot?.voiceMethod ?? null,
      twilio_voice_webhook_issue: "ok",
      twilio_voice_webhook_ok: true,
      expected_voice_webhook_url: expected,
    };
  }

  const assessment = assessTwilioInboundRingVoiceWebhook(snapshot?.voiceUrl, expected);
  return {
    twilio_voice_url: snapshot?.voiceUrl ?? null,
    twilio_voice_method: snapshot?.voiceMethod ?? null,
    twilio_voice_webhook_issue: assessment.issue,
    twilio_voice_webhook_ok: assessment.issue === "ok",
    expected_voice_webhook_url: expected,
  };
}

export async function enrichTwilioPhoneNumberRowsWithVoiceWebhookStatus<
  T extends {
    twilio_sid: string;
    voice_enabled: boolean;
    number_type: string;
    is_primary_company_number: boolean;
    is_company_backup_number: boolean;
  },
>(rows: T[]): Promise<Array<T & TwilioPhoneNumberVoiceWebhookStatus>> {
  const bySid = await fetchTwilioIncomingVoiceWebhooksBySid();
  return rows.map((row) => {
    const sid = typeof row.twilio_sid === "string" ? row.twilio_sid.trim() : "";
    const snapshot = sid ? bySid.get(sid) : undefined;
    return {
      ...row,
      ...buildTwilioPhoneNumberVoiceWebhookStatus(row, snapshot),
    };
  });
}
