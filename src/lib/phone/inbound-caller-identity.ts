import "server-only";

import twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  resolveInboundCallerIdentityUnified,
  type InboundCallerEntityType,
  type InboundCallerIdentityUnified,
} from "@/lib/phone/inbound-caller-identity-resolve";
import type { InboundCallerDisplayJson, VoiceRoutingJsonV1 } from "@/lib/phone/voice-route-plan";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
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

  const e164Key = normalizeInboundTwilioFromToE164(raw);
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

  return {
    e164: u.e164,
    caller_name: u.display_name,
    display_name: u.display_name,
    caller_name_source: u.caller_name_source,
    lead_id: u.lead_id,
    contact_id: u.contact_id,
    conversation_id: u.conversation_id,
    formatted_number: u.formatted_number,
    subtitle: u.subtitle,
    entity_type: u.entity_type,
    entity_id: u.entity_id,
  };
}

export function toRoutingInboundCallerDisplay(r: InboundCallerResolved): InboundCallerDisplayJson {
  return {
    caller_name: r.caller_name,
    caller_name_source: r.caller_name_source,
    lead_id: r.lead_id,
    contact_id: r.contact_id,
    conversation_id: r.conversation_id,
    subtitle: r.subtitle,
    entity_type: r.entity_type,
    entity_id: r.entity_id,
  };
}

export function clientDialExtrasFromRouting(r: VoiceRoutingJsonV1): InboundCallerClientDialExtras | null {
  const d = r.inbound_caller_display;
  if (!d) return null;
  return {
    caller_name: d.caller_name,
    caller_name_source: d.caller_name_source,
    lead_id: d.lead_id ?? null,
    contact_id: d.contact_id ?? null,
    conversation_id: d.conversation_id ?? null,
  };
}

export function toClientDialExtras(r: InboundCallerResolved | null | undefined): InboundCallerClientDialExtras | null {
  if (!r) return null;
  return {
    caller_name: r.caller_name,
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
  if (looked?.trim()) {
    return {
      ...hint,
      caller_name: looked.trim(),
      display_name: looked.trim(),
      caller_name_source: "lookup",
    };
  }
  return hint;
}
