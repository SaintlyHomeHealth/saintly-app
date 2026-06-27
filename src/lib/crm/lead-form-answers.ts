/**
 * Normalize and display Facebook / Meta / Zapier lead form answers for CRM.
 * Supports flat Zapier bodies, Meta `field_data`, and legacy `intake_request` storage.
 */

import type { LeadIntakeRequestDetails } from "@/lib/crm/lead-intake-request";
import { parseLeadIntakeRequestFromMetadata } from "@/lib/crm/lead-intake-request";

export type LeadFormAnswer = {
  key: string;
  label: string;
  value: string;
};

export type NormalizedLeadContactFields = {
  name: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  city: string;
  source: string;
  campaign: string;
  ad_name: string;
  form_name: string;
};

type FlatEntry = { key: string; value: string };

const LABEL_OVERRIDES: Record<string, string> = {
  who_is_care_needed_for: "Who is care needed for?",
  care_for: "Who is care needed for?",
  what_type_of_help_is_needed: "What type of help is needed?",
  help_needed: "What type of help is needed?",
  what_coverage_do_they_have: "What coverage do they have?",
  insurance: "What coverage do they have?",
  coverage: "What coverage do they have?",
  insurance_answer: "What coverage do they have?",
  optional_tell_us_whats_going_on_and_what_kind_of_help_is_needed:
    "Tell us what's going on and what kind of help is needed",
  tell_us_whats_going_on: "Tell us what's going on",
  situation: "Tell us what's going on and what kind of help is needed",
  city: "City",
  wound_care_needed: "Wound care needed",
  wound_type: "Wound type",
  service_needed: "Service needed",
  zip_code: "ZIP code",
  pt_timing: "PT timing",
  start_time: "Start time / timing",
  form_name: "Form name",
  ad_name: "Ad name",
  campaign: "Campaign",
  source: "Source",
};

const STANDARD_CONTACT_ALIASES: Record<keyof NormalizedLeadContactFields, string[]> = {
  name: ["full_name", "full name", "name", "your_full_name", "your full name"],
  first_name: ["first_name", "first name", "firstname"],
  last_name: ["last_name", "last name", "lastname"],
  email: ["email", "email_address", "email address"],
  phone: ["phone", "phone_number", "phone number", "mobile", "mobile_number", "mobile number"],
  city: ["city"],
  source: ["source", "utm_source", "referral_source", "partner_source", "attribution_source"],
  campaign: ["campaign", "utm_campaign"],
  ad_name: ["ad_name", "ad name", "adname", "ad"],
  form_name: ["form_name", "form name"],
};

/** Technical / identity fields hidden from the Lead Form Answers UI. */
const HIDDEN_DISPLAY_KEYS = new Set([
  "id",
  "lead_id",
  "leadgen_id",
  "created_time",
  "created_at",
  "updated_at",
  "ad_id",
  "form_id",
  "campaign_id",
  "page_id",
  "raw_payload",
  "metadata",
  "raw_webhook_body",
  "raw_body_preview",
  "graph_field_data",
  "field_data",
  "fields",
  "form_data",
  "custom_fields",
  "lead_form_answers",
  "intake_request",
  "intake_details",
  "ingestion_channel",
  "ingestion_received_at",
  "ingestion_completed_at",
  "webhook_created_time",
  "graph_created_time",
  "partner_source",
  "partner_campaign",
  "status",
  "lead_type",
  "event_type",
  "object",
  "entry",
  "changes",
]);

const NESTED_PAYLOAD_KEYS = new Set([
  "field_data",
  "fields",
  "form_data",
  "custom_fields",
  "lead_form_answers",
  "data",
  "metadata",
  "raw_payload",
]);

export function canonicalLeadFormFieldKey(key: string): string {
  return key.trim().toLowerCase().replace(/\s+/g, "_");
}

export function formatLeadFormFieldLabel(key: string): string {
  const canonical = canonicalLeadFormFieldKey(key);
  const override = LABEL_OVERRIDES[canonical];
  if (override) return override;

  const cleaned = key
    .trim()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\?+$/, "");

  if (/^question_\d+$/i.test(canonical)) {
    const num = canonical.replace(/^question_/, "");
    return `Question ${num}`;
  }

  if (!cleaned) return key;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

export function scalarToLeadFormDisplayString(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value
      .map((item) => scalarToLeadFormDisplayString(item))
      .filter(Boolean)
      .join(", ");
  }
  if (typeof value === "object") {
    try {
      return JSON.stringify(value);
    } catch {
      return "";
    }
  }
  return String(value).trim();
}

function pickScalarFromMap(map: Map<string, string>, aliases: string[]): string {
  for (const alias of aliases) {
    const v = map.get(canonicalLeadFormFieldKey(alias));
    if (v?.trim()) return v.trim();
  }
  return "";
}

function buildFieldMapFromFlatEntries(entries: FlatEntry[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const entry of entries) {
    const key = canonicalLeadFormFieldKey(entry.key);
    const value = entry.value.trim();
    if (!key || !value) continue;
    if (!map.has(key)) map.set(key, value);
  }
  return map;
}

function flattenGraphFieldDataArray(rows: unknown): FlatEntry[] {
  if (!Array.isArray(rows)) return [];
  const out: FlatEntry[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name =
      typeof r.name === "string"
        ? r.name
        : typeof r.key === "string"
          ? r.key
          : typeof r.label === "string"
            ? r.label
            : "";
    if (!name.trim()) continue;

    if (Array.isArray(r.values)) {
      const val = r.values.map((v) => scalarToLeadFormDisplayString(v)).filter(Boolean).join(", ");
      if (val) out.push({ key: name, value: val });
      continue;
    }

    const val = scalarToLeadFormDisplayString(r.value ?? r.answer ?? r.text);
    if (val) out.push({ key: name, value: val });
  }
  return out;
}

function flattenStoredLeadFormAnswers(value: unknown): FlatEntry[] {
  if (!Array.isArray(value)) return [];
  const out: FlatEntry[] = [];
  for (const row of value) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const key =
      typeof r.key === "string"
        ? r.key
        : typeof r.name === "string"
          ? r.name
          : typeof r.question === "string"
            ? r.question
            : typeof r.field === "string"
              ? r.field
              : "";
    const val = scalarToLeadFormDisplayString(r.value ?? r.answer ?? r.text);
    if (key.trim() && val) out.push({ key, value: val });
  }
  return out;
}

function flattenIncomingPayload(body: unknown, depth = 0): FlatEntry[] {
  if (body == null || depth > 6) return [];

  if (typeof body === "string") {
    const trimmed = body.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return [];
    try {
      return flattenIncomingPayload(JSON.parse(trimmed), depth + 1);
    } catch {
      return [];
    }
  }

  if (Array.isArray(body)) {
    if (body.length > 0 && body[0] && typeof body[0] === "object" && ("name" in (body[0] as object) || "values" in (body[0] as object))) {
      return flattenGraphFieldDataArray(body);
    }
    return body.flatMap((item) => flattenIncomingPayload(item, depth + 1));
  }

  if (typeof body !== "object") return [];

  const obj = body as Record<string, unknown>;
  const out: FlatEntry[] = [];

  for (const nestedKey of NESTED_PAYLOAD_KEYS) {
    if (obj[nestedKey] != null) {
      out.push(...flattenIncomingPayload(obj[nestedKey], depth + 1));
    }
  }

  for (const [key, value] of Object.entries(obj)) {
    const canonical = canonicalLeadFormFieldKey(key);
    if (NESTED_PAYLOAD_KEYS.has(canonical)) continue;
    if (value == null) continue;
    if (typeof value === "object") continue;
    const val = scalarToLeadFormDisplayString(value);
    if (val) out.push({ key, value: val });
  }

  return out;
}

function isStandardLeadContactKey(key: string): boolean {
  const canonical = canonicalLeadFormFieldKey(key);
  for (const aliases of Object.values(STANDARD_CONTACT_ALIASES)) {
    if (aliases.some((alias) => canonicalLeadFormFieldKey(alias) === canonical)) return true;
  }
  return false;
}

export function isHiddenLeadFormDisplayKey(key: string): boolean {
  const canonical = canonicalLeadFormFieldKey(key);
  return HIDDEN_DISPLAY_KEYS.has(canonical) || isStandardLeadContactKey(key);
}

function entriesToLeadFormAnswers(entries: FlatEntry[]): LeadFormAnswer[] {
  const seen = new Set<string>();
  const out: LeadFormAnswer[] = [];

  for (const entry of entries) {
    const key = canonicalLeadFormFieldKey(entry.key);
    const value = entry.value.trim();
    if (!key || !value || isHiddenLeadFormDisplayKey(key) || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key,
      label: formatLeadFormFieldLabel(entry.key),
      value,
    });
  }

  out.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
  return out;
}

export function extractNormalizedLeadContactFields(body: unknown): NormalizedLeadContactFields {
  const map = buildFieldMapFromFlatEntries(flattenIncomingPayload(body));
  const firstName = pickScalarFromMap(map, STANDARD_CONTACT_ALIASES.first_name);
  const lastName = pickScalarFromMap(map, STANDARD_CONTACT_ALIASES.last_name);
  const explicitName = pickScalarFromMap(map, STANDARD_CONTACT_ALIASES.name);
  const name = explicitName || [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    name,
    first_name: firstName,
    last_name: lastName,
    email: pickScalarFromMap(map, STANDARD_CONTACT_ALIASES.email),
    phone: pickScalarFromMap(map, STANDARD_CONTACT_ALIASES.phone).replace(/\D/g, ""),
    city: pickScalarFromMap(map, STANDARD_CONTACT_ALIASES.city),
    source: pickScalarFromMap(map, STANDARD_CONTACT_ALIASES.source),
    campaign: pickScalarFromMap(map, STANDARD_CONTACT_ALIASES.campaign),
    ad_name: pickScalarFromMap(map, STANDARD_CONTACT_ALIASES.ad_name),
    form_name: pickScalarFromMap(map, STANDARD_CONTACT_ALIASES.form_name),
  };
}

export function buildLeadFormAnswersFromPayload(body: unknown): LeadFormAnswer[] {
  return entriesToLeadFormAnswers(flattenIncomingPayload(body));
}

function intakeRequestToAnswers(intake: LeadIntakeRequestDetails): LeadFormAnswer[] {
  const pairs: [keyof LeadIntakeRequestDetails, string][] = [
    ["zip_code", "zip_code"],
    ["service_needed", "service_needed"],
    ["care_for", "care_for"],
    ["start_time", "start_time"],
    ["situation", "situation"],
    ["pt_timing", "pt_timing"],
    ["wound_type", "wound_type"],
    ["insurance_answer", "insurance_answer"],
  ];

  const out: LeadFormAnswer[] = [];
  for (const [field, key] of pairs) {
    const value = (intake[field] ?? "").trim();
    if (!value) continue;
    out.push({
      key,
      label: formatLeadFormFieldLabel(key),
      value,
    });
  }
  return out;
}

function objectScalarsToAnswers(obj: unknown): LeadFormAnswer[] {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return [];
  const entries: FlatEntry[] = [];
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value == null || typeof value === "object") continue;
    const val = scalarToLeadFormDisplayString(value);
    if (val) entries.push({ key, value: val });
  }
  return entriesToLeadFormAnswers(entries);
}

function mergeLeadFormAnswers(lists: LeadFormAnswer[][]): LeadFormAnswer[] {
  const byKey = new Map<string, LeadFormAnswer>();
  for (const list of lists) {
    for (const answer of list) {
      if (!byKey.has(answer.key)) byKey.set(answer.key, answer);
    }
  }
  return [...byKey.values()].sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));
}

/**
 * Read custom Q&A from any storage shape used by Facebook / Zapier / Meta intake.
 */
export function parseLeadFormAnswersFromLeadRecord(input: {
  external_source_metadata?: unknown;
  notes?: string | null;
}): LeadFormAnswer[] {
  const meta =
    input.external_source_metadata && typeof input.external_source_metadata === "object" && !Array.isArray(input.external_source_metadata)
      ? (input.external_source_metadata as Record<string, unknown>)
      : null;

  const lists: LeadFormAnswer[][] = [];

  if (meta) {
    const stored = meta.lead_form_answers;
    if (Array.isArray(stored) && stored.length > 0) {
      lists.push(entriesToLeadFormAnswers(flattenStoredLeadFormAnswers(stored)));
    }

    lists.push(buildLeadFormAnswersFromPayload(meta.raw_payload));
    lists.push(buildLeadFormAnswersFromPayload(meta.form_data));
    lists.push(buildLeadFormAnswersFromPayload(meta.custom_fields));

    const nestedMeta =
      meta.metadata && typeof meta.metadata === "object" && !Array.isArray(meta.metadata)
        ? (meta.metadata as Record<string, unknown>)
        : null;
    if (nestedMeta) {
      lists.push(buildLeadFormAnswersFromPayload(nestedMeta));
      lists.push(buildLeadFormAnswersFromPayload(nestedMeta.field_data));
    }

    lists.push(buildLeadFormAnswersFromPayload(meta.raw_payload && typeof meta.raw_payload === "object" ? (meta.raw_payload as Record<string, unknown>).field_data : null));
    lists.push(buildLeadFormAnswersFromPayload(meta.raw_webhook_body));
    lists.push(buildLeadFormAnswersFromPayload(meta.graph_field_data));
    lists.push(objectScalarsToAnswers(meta.intake_details));
    lists.push(intakeRequestToAnswers(parseLeadIntakeRequestFromMetadata(meta)));
  }

  const notesText = (input.notes ?? "").trim();
  if (notesText.includes("Fields:\n")) {
    const block = notesText.split("Fields:\n")[1]?.trim() ?? "";
    const noteEntries: FlatEntry[] = [];
    for (const line of block.split("\n")) {
      const idx = line.indexOf(":");
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key && value) noteEntries.push({ key, value });
    }
    lists.push(entriesToLeadFormAnswers(noteEntries));
  }

  return mergeLeadFormAnswers(lists);
}

export function attachLeadFormAnswersToExternalMetadata(
  meta: Record<string, unknown>,
  rawBody: unknown
): Record<string, unknown> {
  const payload =
    rawBody && typeof rawBody === "object"
      ? rawBody
      : typeof rawBody === "string"
        ? (() => {
            try {
              return JSON.parse(rawBody);
            } catch {
              return null;
            }
          })()
        : null;

  return {
    ...meta,
    lead_form_answers: buildLeadFormAnswersFromPayload(payload),
    raw_payload: payload ?? meta.raw_payload ?? null,
  };
}

export function logLeadWebhookSubmission(logPrefix: string, body: unknown): void {
  const topLevelKeys =
    body && typeof body === "object" && !Array.isArray(body) ? Object.keys(body as Record<string, unknown>) : [];
  const flattened = flattenIncomingPayload(body);
  console.log(`${logPrefix} webhook submission`, {
    top_level_keys: topLevelKeys,
    flattened_field_count: flattened.length,
    field_keys: flattened.map((entry) => entry.key),
    normalized_contact: extractNormalizedLeadContactFields(body),
  });
}
