import "server-only";

import twilio from "twilio";
import type { SupabaseClient } from "@supabase/supabase-js";

import { buildIncomingContactDisplayName, type IncomingCallerContactRow } from "@/lib/crm/incoming-caller-lookup";
import { findContactByIncomingPhone, type CrmContactMatch } from "@/lib/crm/find-contact-by-incoming-phone";
import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import type { InboundCallerDisplayJson, VoiceRoutingJsonV1 } from "@/lib/phone/voice-route-plan";
import { normalizeRecruitingPhoneForStorage } from "@/lib/recruiting/recruiting-contact-normalize";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

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

function contactToIncomingRow(contact: CrmContactMatch): IncomingCallerContactRow {
  return {
    full_name: contact.full_name,
    first_name: contact.first_name,
    last_name: contact.last_name,
    organization_name: contact.organization_name ?? null,
    primary_phone: contact.primary_phone,
    secondary_phone: contact.secondary_phone,
  };
}

function facilityContactDisplayName(row: {
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
}): string | null {
  const fn = (row.full_name ?? "").trim();
  if (fn) return fn;
  const first = (row.first_name ?? "").trim();
  const last = (row.last_name ?? "").trim();
  const combined = `${first} ${last}`.trim();
  if (combined) return combined;
  const t = (row.title ?? "").trim();
  return t || null;
}

function trimPruneName(s: string | null | undefined): string | null {
  const t = (s ?? "").trim();
  return t ? t : null;
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
  const formatted = formatPhoneNumber(e164 || raw) || raw || "Unknown";

  if (!raw || raw.toLowerCase().startsWith("client:")) {
    return {
      e164,
      caller_name: null,
      caller_name_source: "number_only",
      lead_id: null,
      contact_id: null,
      conversation_id: null,
      formatted_number: raw.toLowerCase().startsWith("client:") ? "Internal / browser call" : formatted,
    };
  }

  const e164Key = normalizeInboundTwilioFromToE164(raw);
  if (!e164Key) {
    return {
      e164,
      caller_name: null,
      caller_name_source: "number_only",
      lead_id: null,
      contact_id: null,
      conversation_id: null,
      formatted_number: formatted,
    };
  }

  const contact = await findContactByIncomingPhone(supabase, e164Key);

  if (contact) {
    const name = buildIncomingContactDisplayName(contactToIncomingRow(contact));
    const candidates = phoneLookupCandidates(e164Key);

    const { data: leadRow } = await supabase
      .from("leads")
      .select("id")
      .eq("contact_id", contact.id)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const leadId = leadRow && typeof leadRow.id === "string" ? leadRow.id : null;

    let conversationId: string | null = null;
    if (candidates.length > 0) {
      const { data: convRow } = await supabase
        .from("conversations")
        .select("id")
        .eq("channel", "sms")
        .in("main_phone_e164", candidates)
        .limit(1)
        .maybeSingle();
      conversationId = convRow && typeof convRow.id === "string" ? convRow.id : null;
    }

    return {
      e164: e164Key,
      caller_name: name,
      caller_name_source: name ? "internal" : "number_only",
      lead_id: leadId,
      contact_id: contact.id,
      conversation_id: conversationId,
      formatted_number: formatPhoneNumber(e164Key),
    };
  }

  const candidates = phoneLookupCandidates(e164Key);
  if (candidates.length > 0) {
    const ors = candidates.flatMap((c) => [`direct_phone.eq.${c}`, `mobile_phone.eq.${c}`]);
    const { data: match, error: facErr } = await supabase
      .from("facility_contacts")
      .select("id, full_name, first_name, last_name, title, direct_phone, mobile_phone")
      .or(ors.join(","))
      .limit(1)
      .maybeSingle();

    if (!facErr && match && typeof match.id === "string") {
      const disp = facilityContactDisplayName({
        full_name: typeof match.full_name === "string" ? match.full_name : null,
        first_name: typeof match.first_name === "string" ? match.first_name : null,
        last_name: typeof match.last_name === "string" ? match.last_name : null,
        title: typeof match.title === "string" ? match.title : null,
      });
      return {
        e164: e164Key,
        caller_name: disp,
        caller_name_source: disp ? "internal" : "number_only",
        lead_id: null,
        contact_id: null,
        conversation_id: null,
        formatted_number: formatPhoneNumber(e164Key),
      };
    }
  }

  const np = normalizeRecruitingPhoneForStorage(e164Key);
  if (np) {
    const { data: rc } = await supabase
      .from("recruiting_candidates")
      .select("id, full_name")
      .eq("normalized_phone", np)
      .limit(1)
      .maybeSingle();
    if (rc && typeof rc.id === "string") {
      const nm = trimPruneName(typeof rc.full_name === "string" ? rc.full_name : null);
      return {
        e164: e164Key,
        caller_name: nm,
        caller_name_source: nm ? "internal" : "number_only",
        lead_id: null,
        contact_id: null,
        conversation_id: null,
        formatted_number: formatPhoneNumber(e164Key),
      };
    }
  }

  return {
    e164: e164Key,
    caller_name: null,
    caller_name_source: "number_only",
    lead_id: null,
    contact_id: null,
    conversation_id: null,
    formatted_number: formatPhoneNumber(e164Key),
  };
}

export function toRoutingInboundCallerDisplay(r: InboundCallerResolved): InboundCallerDisplayJson {
  return {
    caller_name: r.caller_name,
    caller_name_source: r.caller_name_source,
    lead_id: r.lead_id,
    contact_id: r.contact_id,
    conversation_id: r.conversation_id,
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
      caller_name_source: "lookup",
    };
  }
  return hint;
}
