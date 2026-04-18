import "server-only";

import twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveInboundCallerIdentityUnified,
  type InboundCallerEntityType,
  type InboundCallerIdentityUnified,
} from "@/lib/phone/inbound-caller-identity-resolve";
import type { InboundCallerDisplayJson, VoiceRoutingJsonV1 } from "@/lib/phone/voice-route-plan";
import { formatPhoneNumber, normalizePhone } from "@/lib/phone/us-phone-format";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export { resolveInboundCallerIdentityUnified };
export type { InboundCallerEntityType, InboundCallerIdentityUnified };

/** Twilio `<Client><Parameter>` extras for Voice SDK + CallKit (best-effort). */
export type InboundCallerClientDialExtras = {
  caller_name?: string | null;
  caller_name_source?: string | null;
  lead_id?: string | null;
  contact_id?: string | null;
  conversation_id?: string | null;
};

export type CallerNameSource = "internal" | "lookup" | "number_only";

export type InboundCallerResolved = {
  e164: string;
  caller_name: string | null;
  caller_name_source: CallerNameSource;
  lead_id: string | null;
  contact_id: string | null;
  conversation_id: string | null;
  formatted_number: string;
  /** Same as caller_name when present; kept for unified identity consumers. */
  display_name: string | null;
  subtitle: string | null;
  entity_type: InboundCallerEntityType;
  entity_id: string | null;
};

const LOOKUP_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LOOKUP_CACHE_MAX = 500;
const lookupCache = new Map<string, { name: string; at: number }>();

/**
 * Normalize Twilio PSTN `From` to E.164 for CRM matching. Returns null for client identities / invalid.
 */
export function normalizeInboundTwilioFromToE164(raw: string | null | undefined): string | null {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return null;
  if (t.toLowerCase().startsWith("client:")) return null;
  const n = normalizeDialInputToE164(t);
  if (n && isValidE164(n)) return n;
  return null;
}

/**
 * Strip UUID-like / 32-hex opaque tokens from human display fields (browser/API must not surface these as names).
 */
export function sanitizeInboundDisplayText(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  if (!t) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return null;
  if (/^[0-9a-f]{32}$/i.test(t.replace(/-/g, ""))) return null;
  return t;
}

/** Avoid surfacing fake NANP formatting when raw From is a UUID/opaque token (Twilio custom CLI). */
export function sanitizeInboundFormattedLine(rawFrom: string, formatted: string): string {
  const t = rawFrom.trim();
  if (t.toLowerCase().startsWith("client:")) return "Internal / browser call";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(t)) return "Caller ID unavailable";
  if (/^[0-9a-f]{32}$/i.test(t.replace(/-/g, ""))) return "Caller ID unavailable";
  return formatted;
}

/**
 * Last-resort NANP E.164 for CRM lookup when strict normalization fails but digits look US-local.
 */
function inboundCallerE164KeyForLookup(raw: string): string | null {
  const strict = normalizeInboundTwilioFromToE164(raw);
  if (strict) return strict;
  const d = normalizePhone(raw);
  if (d.length === 10) return `+1${d}`;
  if (d.length === 11 && d.startsWith("1")) return `+${d}`;
  return null;
}

/**
 * Best-effort internal CRM + ops directory match (no external APIs). Safe to await alongside phone logging.
 */
export async function resolveInboundCallerInternal(
  supabase: SupabaseClient,
  fromRaw: string | null | undefined
): Promise<InboundCallerResolved> {
  const raw = typeof fromRaw === "string" ? fromRaw.trim() : "";
  const e164 = normalizeInboundTwilioFromToE164(raw) ?? raw;
  const formattedFallback = formatPhoneNumber(e164 || raw) || raw || "Unknown";

  if (!raw || raw.toLowerCase().startsWith("client:")) {
    return {
      e164,
      caller_name: null,
      display_name: null,
      caller_name_source: "number_only",
      lead_id: null,
      contact_id: null,
      conversation_id: null,
      formatted_number: raw.toLowerCase().startsWith("client:") ? "Internal / browser call" : formattedFallback,
      subtitle: null,
      entity_type: "unknown",
      entity_id: null,
    };
  }

  const e164Key = inboundCallerE164KeyForLookup(raw);
  if (!e164Key) {
    return {
      e164,
      caller_name: null,
      display_name: null,
      caller_name_source: "number_only",
      lead_id: null,
      contact_id: null,
      conversation_id: null,
      formatted_number: formattedFallback,
      subtitle: null,
      entity_type: "unknown",
      entity_id: null,
    };
  }

  const u = await resolveInboundCallerIdentityUnified(supabase, e164Key);

  const display = sanitizeInboundDisplayText(u.display_name);
  const sub = sanitizeInboundDisplayText(u.subtitle);
  const formatted = sanitizeInboundFormattedLine(raw, u.formatted_number);

  return {
    e164: u.e164,
    caller_name: display,
    display_name: display,
    caller_name_source: u.caller_name_source,
    lead_id: u.lead_id,
    contact_id: u.contact_id,
    conversation_id: u.conversation_id,
    formatted_number: formatted,
    subtitle: sub,
    entity_type: u.entity_type,
    entity_id: u.entity_id,
  };
}

export function toRoutingInboundCallerDisplay(r: InboundCallerResolved): InboundCallerDisplayJson {
  return {
    caller_name: r.caller_name,
    display_name: r.display_name,
    formatted_number: r.formatted_number,
    e164: r.e164,
    caller_name_source: r.caller_name_source,
    lead_id: r.lead_id,
    contact_id: r.contact_id,
    conversation_id: r.conversation_id,
    subtitle: r.subtitle,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
  };
}

/**
 * Value for TwiML `<Parameter name="caller_name">` / mobile CallKit customParameters.
 * Prefers CRM/lookup display; never entity UUIDs. Omits only when no human-readable label exists.
 */
function twimlCallerNameParameterFromParts(input: {
  display_name: string | null | undefined;
  caller_name: string | null | undefined;
  formatted_number: string | null | undefined;
  e164: string | null | undefined;
}): string | null {
  const a = sanitizeInboundDisplayText(input.display_name);
  if (a) return a;
  const b = sanitizeInboundDisplayText(input.caller_name);
  if (b) return b;
  const fmtRaw = (input.formatted_number ?? "").trim();
  if (fmtRaw) {
    const fmt = sanitizeInboundDisplayText(fmtRaw);
    if (fmt) return fmt;
  }
  const raw = (input.e164 ?? "").trim();
  if (!raw) return null;
  const digits = normalizePhone(raw);
  if (digits.length >= 10 && digits.length <= 15) {
    return formatPhoneNumber(raw) || raw;
  }
  return null;
}

export function twimlCallerNameParameterFromResolved(r: InboundCallerResolved): string | null {
  return twimlCallerNameParameterFromParts({
    display_name: r.display_name,
    caller_name: r.caller_name,
    formatted_number: r.formatted_number,
    e164: r.e164,
  });
}

function twimlCallerNameParameterFromInboundCallerDisplay(d: InboundCallerDisplayJson): string | null {
  return twimlCallerNameParameterFromParts({
    display_name: d.display_name,
    caller_name: d.caller_name,
    formatted_number: d.formatted_number,
    e164: d.e164,
  });
}

export function clientDialExtrasFromRouting(r: VoiceRoutingJsonV1): InboundCallerClientDialExtras | null {
  const d = r.inbound_caller_display;
  if (!d) return null;
  return {
    caller_name: twimlCallerNameParameterFromInboundCallerDisplay(d),
    caller_name_source: d.caller_name_source,
    lead_id: d.lead_id ?? null,
    contact_id: d.contact_id ?? null,
    conversation_id: d.conversation_id ?? null,
  };
}

export function toClientDialExtras(r: InboundCallerResolved | null | undefined): InboundCallerClientDialExtras | null {
  if (!r) return null;
  return {
    caller_name: twimlCallerNameParameterFromResolved(r),
    caller_name_source: r.caller_name_source,
    lead_id: r.lead_id,
    contact_id: r.contact_id,
    conversation_id: r.conversation_id,
  };
}

/**
 * Twilio Lookup caller name (CNAM). Opt-in via SAINTLY_INBOUND_CALLER_LOOKUP_ENABLED=1; short timeout; cached.
 */
export async function maybeLookupCallerNameTwilio(e164: string, timeoutMs: number): Promise<string | null> {
  if (process.env.SAINTLY_INBOUND_CALLER_LOOKUP_ENABLED?.trim() !== "1") return null;
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!sid || !token || !isValidE164(e164)) return null;

  const cached = lookupCache.get(e164);
  if (cached && Date.now() - cached.at < LOOKUP_CACHE_TTL_MS) {
    return cached.name;
  }

  const client = twilio(sid, token);
  const lookupPromise = (async (): Promise<string | null> => {
    try {
      const res = await client.lookups.v2.phoneNumbers(e164).fetch({ fields: "caller_name" });
      const raw = res.callerName?.callerName;
      const name = typeof raw === "string" ? raw.trim() : "";
      return name || null;
    } catch {
      return null;
    }
  })();

  const timeout = new Promise<null>((resolve) => {
    setTimeout(() => resolve(null), timeoutMs);
  });

  const name = await Promise.race([lookupPromise, timeout]);
  if (name) {
    lookupCache.set(e164, { name, at: Date.now() });
    if (lookupCache.size > LOOKUP_CACHE_MAX) {
      const first = lookupCache.keys().next().value as string | undefined;
      if (first) lookupCache.delete(first);
    }
  }
  return name;
}

/**
 * FCM payload: add Twilio Lookup when internal match did not yield a name. Never throws.
 */
export async function enrichInboundCallerForPush(
  hint: InboundCallerResolved,
  lookupTimeoutMs = 450
): Promise<InboundCallerResolved> {
  if (hint.caller_name?.trim() && hint.caller_name_source !== "number_only") {
    return hint;
  }
  const rawE164 = (hint.e164 ?? "").trim();
  const e164 =
    normalizeInboundTwilioFromToE164(rawE164) ?? (isValidE164(rawE164) ? rawE164 : null);
  if (!e164) return hint;

  const looked = await maybeLookupCallerNameTwilio(e164, lookupTimeoutMs);
  const fromLookup = looked?.trim() ? sanitizeInboundDisplayText(looked.trim()) : null;
  if (fromLookup) {
    return {
      ...hint,
      caller_name: fromLookup,
      display_name: fromLookup,
      caller_name_source: "lookup",
    };
  }
  return hint;
}
