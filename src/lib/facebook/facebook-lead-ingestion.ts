/**
 * Facebook Lead Ads → CRM: shared insert logic for (1) Zapier / Make / external automation
 * webhook `ingestFacebookLeadFromAutomationPayload` and (2) legacy direct Meta webhook + Graph fetch
 * `ingestFacebookLeadFromWebhookPayload`.
 */
import "server-only";

import { revalidatePath } from "next/cache";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildLeadIntakeRequestFromFieldMap } from "@/lib/crm/lead-intake-request";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { runPostCreateLeadStaffNotifications } from "@/lib/crm/post-create-lead-workflow";
import { isKnownPayerBroadCategory } from "@/lib/crm/payer-type-options";
import { isValidServiceDisciplineCode, type ServiceDisciplineCode } from "@/lib/crm/service-disciplines";
import { LEAD_ACTIVITY_EVENT } from "@/lib/crm/lead-activity-types";
import { runFacebookLeadIntroSmsAfterInsert } from "@/lib/facebook/facebook-lead-intro-sms";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_API_VERSION?.trim() || "v21.0";

export type MetaLeadgenChangeValue = {
  leadgen_id?: string;
  page_id?: string;
  form_id?: string;
  created_time?: number | string;
  ad_id?: string;
  adgroup_id?: string;
};

export type MetaWebhookBody = {
  object?: string;
  entry?: Array<{
    id?: string;
    time?: number;
    changes?: Array<{
      field?: string;
      value?: MetaLeadgenChangeValue;
    }>;
  }>;
};

/** Graph Lead Ads `field_data` row shape (also accepted from Zapier/Make when mirroring Graph). */
export type GraphFieldDatum = { name?: string; values?: string[] };

type GraphLeadResponse = {
  id?: string;
  created_time?: string;
  field_data?: GraphFieldDatum[];
  error?: { message?: string; type?: string; code?: number };
};

function asTrimmedString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function buildFieldMap(fieldData: GraphFieldDatum[] | undefined): Map<string, string> {
  const m = new Map<string, string>();
  if (!Array.isArray(fieldData)) return m;
  for (const row of fieldData) {
    const key = asTrimmedString(row?.name).toLowerCase();
    const vals = Array.isArray(row?.values) ? row.values : [];
    const val = vals.map((x) => (typeof x === "string" ? x.trim() : String(x ?? ""))).filter(Boolean).join(", ");
    if (key && val) m.set(key, val);
  }
  return m;
}

/** Flat object from Zapier/Make (keys lowercased; see `normalizeAutomationFlatFieldMap`). */
function buildFieldMapFromFlatRecord(rec: Record<string, unknown>): Map<string, string> {
  const m = new Map<string, string>();
  for (const [k, v] of Object.entries(rec)) {
    const key = asTrimmedString(k).toLowerCase();
    if (!key || key === "leadgen_id") continue;
    const valStr =
      v == null
        ? ""
        : typeof v === "string"
          ? v.trim()
          : typeof v === "number" || typeof v === "boolean"
            ? String(v)
            : "";
    if (valStr) m.set(key, valStr);
  }
  return m;
}

/**
 * Fills canonical keys used by `parseNameParts` / `firstValue` when Zapier sends synonyms
 * (e.g. `name` vs `full_name`, `phone` vs `phone_number`).
 */
function normalizeAutomationFlatFieldMap(map: Map<string, string>): void {
  const pick = (...keys: string[]): string | undefined => {
    for (const k of keys) {
      const v = map.get(k);
      if (v) return v;
    }
    return undefined;
  };
  const setIf = (canonical: string, val: string | undefined) => {
    if (val && !map.get(canonical)) map.set(canonical, val);
  };
  setIf("full_name", pick("name", "full name", "your_full_name", "full_name"));
  setIf("name", pick("full_name", "full name", "your_full_name"));
  setIf("first_name", pick("first name", "firstname", "first_name"));
  setIf("last_name", pick("last name", "lastname", "last_name"));
  setIf("email", pick("email_address", "email"));
  setIf("email_address", pick("email", "email_address"));
  setIf(
    "phone_number",
    pick("phone", "phone number", "mobile", "mobile_phone", "mobile number", "tel", "telephone")
  );
  setIf("phone", pick("phone_number", "phone number", "mobile", "mobile_phone"));
}

function firstValue(map: Map<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = map.get(k);
    if (v) return v;
  }
  return "";
}

function normalizeStoredPhone(raw: string): string | null {
  const d = normalizePhone(raw);
  if (!d) return null;
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  if (d.length > 10) return d;
  return null;
}

function parseNameParts(map: Map<string, string>): { first_name: string; last_name: string; full_name: string } {
  let full = firstValue(map, ["full_name", "full name", "your_full_name", "name"]);
  let first = firstValue(map, ["first_name", "first name", "firstname"]);
  let last = firstValue(map, ["last_name", "last name", "lastname"]);

  if (full && !first && !last) {
    const parts = full.split(/\s+/).filter(Boolean);
    first = parts[0] ?? "";
    last = parts.slice(1).join(" ");
  }

  if (!full && (first || last)) {
    full = [first, last].filter(Boolean).join(" ").trim();
  }

  if (!first && !last && !full) {
    const email = firstValue(map, ["email", "email_address"]);
    const local = email.includes("@") ? email.split("@")[0]?.trim() : "";
    if (local) {
      full = local.replace(/[._]+/g, " ").trim() || "Facebook lead";
      const ep = full.split(/\s+/).filter(Boolean);
      first = ep[0] ?? "Lead";
      last = ep.slice(1).join(" ") || "";
    } else {
      first = "Facebook";
      last = "Lead";
      full = "Facebook lead";
    }
  } else if (!first && !last) {
    first = "Facebook";
    last = "Lead";
    full = full || "Facebook lead";
  }

  return {
    first_name: first || "Facebook",
    last_name: last || "Lead",
    full_name: full || [first, last].filter(Boolean).join(" ").trim(),
  };
}

function guessPayerType(map: Map<string, string>): string | null {
  const blob = [...map.entries()]
    .map(([k, v]) => `${k} ${v}`)
    .join(" ")
    .toLowerCase();
  const order: Array<{ needle: string; value: string }> = [
    { needle: "medicare", value: "Medicare" },
    { needle: "medicaid", value: "Medicaid" },
    { needle: "private pay", value: "Private Pay" },
    { needle: "private insurance", value: "Private Insurance" },
  ];
  for (const { needle, value } of order) {
    if (blob.includes(needle) && isKnownPayerBroadCategory(value)) return value;
  }
  const direct = firstValue(map, ["payer_type", "payer type", "insurance_type", "insurance type"]);
  if (direct && isKnownPayerBroadCategory(direct)) return direct.trim();
  return null;
}

function guessPayerName(map: Map<string, string>): string | null {
  const v = firstValue(map, [
    "payer_name",
    "payer name",
    "insurance_company",
    "insurance company",
    "company_name",
    "company name",
  ]);
  return v ? v.slice(0, 500) : null;
}

function guessDisciplines(map: Map<string, string>): string[] {
  const blob = [...map.values()].join(" ").toUpperCase();
  const out: string[] = [];
  for (const code of ["RN", "LPN", "PT", "OT", "ST", "MSW", "HHA"] as const) {
    if (blob.includes(code) && isValidServiceDisciplineCode(code) && !out.includes(code)) out.push(code);
  }
  return out;
}

/**
 * Maps free-text intake (e.g. Facebook `service_needed` = "Wound Care") to canonical
 * `ServiceDisciplineCode` values (RN, PT, OT, ST, MSW, HHA, LPN) used in `leads.service_disciplines` (text[]).
 */
function inferDisciplinesFromFreeText(text: string): ServiceDisciplineCode[] {
  const t = text.toLowerCase();
  const out: ServiceDisciplineCode[] = [];
  const add = (c: ServiceDisciplineCode) => {
    if (!out.includes(c)) out.push(c);
  };
  if (
    t.includes("wound") ||
    t.includes("skilled nursing") ||
    t.includes("skilled nurse") ||
    t.includes("infusion") ||
    t.includes("catheter") ||
    t.includes("ostomy") ||
    /\b(iv|intravenous)\b/.test(t)
  ) {
    add("RN");
  }
  if (t.includes("physical therapy") || t.includes("physiotherapy") || /\bphysical therapist\b/.test(t)) add("PT");
  if (t.includes("occupational therapy") || /\boccupational therapist\b/.test(t)) add("OT");
  if (t.includes("speech therapy") || t.includes("speech-language") || t.includes("speech language")) add("ST");
  if (t.includes("social work") || t.includes("medical social")) add("MSW");
  if (t.includes("home health aide") || /\b(hha|home aide)\b/.test(t)) add("HHA");
  if (/\b(lpn|lvn)\b/.test(t)) add("LPN");
  return out;
}

function resolveFacebookLeadDisciplines(fieldMap: Map<string, string>): ServiceDisciplineCode[] {
  const fromAbbrev = guessDisciplines(fieldMap).filter((c): c is ServiceDisciplineCode =>
    isValidServiceDisciplineCode(c)
  );
  const prioritized = [
    firstValue(fieldMap, ["service_needed", "service needed", "care_for", "care for", "situation"]),
    firstValue(fieldMap, ["start_time", "start time"]),
    ...Array.from(fieldMap.values()),
  ]
    .filter(Boolean)
    .join(" ");
  const fromText = inferDisciplinesFromFreeText(prioritized);
  return [...new Set([...fromAbbrev, ...fromText])];
}

function freeformNotesFromMap(map: Map<string, string>, usedKeys: Set<string>): string | null {
  const lines: string[] = [];
  for (const [k, v] of map.entries()) {
    if (usedKeys.has(k)) continue;
    if (!v.trim()) continue;
    lines.push(`${k}: ${v}`);
  }
  if (lines.length === 0) return null;
  return lines.slice(0, 40).join("\n").slice(0, 8000);
}

const USED_META_KEYS = new Set<string>([
  "full_name",
  "full name",
  "first_name",
  "first name",
  "last_name",
  "last name",
  "your_full_name",
  "name",
  "firstname",
  "lastname",
  "email",
  "email_address",
  "phone_number",
  "phone",
  "mobile_number",
  "mobile_phone",
  "home_phone",
  "work_phone",
  "payer_name",
  "payer name",
  "payer_type",
  "payer type",
  "referral_source",
  "referral source",
  "how_did_you_hear",
  "notes",
  "message",
  "questions",
  "comments",
  "additional_comments",
  "additional notes",
  "service_needed",
  "service needed",
  "care_for",
  "care for",
  "situation",
  "start_time",
  "start time",
]);

async function fetchLeadFromGraph(leadgenId: string, pageAccessToken: string): Promise<GraphLeadResponse> {
  const u = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(leadgenId)}`);
  u.searchParams.set("fields", "id,created_time,field_data");
  u.searchParams.set("access_token", pageAccessToken);
  const res = await fetch(u.toString(), { method: "GET", cache: "no-store" });
  const json = (await res.json()) as GraphLeadResponse;
  if (!res.ok) {
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (json.error?.message) {
    throw new Error(json.error.message);
  }
  return json;
}

export type IngestFacebookLeadgenResult =
  | { ok: true; duplicateSkipped: true; leadgenId: string }
  | { ok: true; duplicateSkipped: false; leadId: string; contactId: string; leadgenId: string }
  | { ok: false; error: string; leadgenId?: string };

function isUniqueViolation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  if (err.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(String(err.message ?? ""));
}

function isAutomationLikeIngestion(ch: "automation" | "csv" | undefined): boolean {
  return ch === "automation" || ch === "csv";
}

async function completeFacebookLeadInsertFromFieldMap(
  supabase: SupabaseClient,
  params: {
    leadgenId: string;
    fieldMap: Map<string, string>;
    fieldDataForMeta: GraphFieldDatum[] | null;
    pageId: string | null;
    formId: string | null;
    createdTimeRaw: number | string | undefined;
    graphCreatedTime: string | null;
    rawBodyText: string;
    ingestionReceivedAt: string;
    ingestionChannel?: "automation" | "csv";
  }
): Promise<IngestFacebookLeadgenResult> {
  const {
    leadgenId,
    fieldMap,
    fieldDataForMeta,
    pageId,
    formId,
    createdTimeRaw,
    graphCreatedTime,
    rawBodyText,
    ingestionReceivedAt,
    ingestionChannel,
  } = params;

  const nameParts = parseNameParts(fieldMap);
  const email = firstValue(fieldMap, ["email", "email_address"]) || null;
  const phoneRaw = firstValue(fieldMap, [
    "phone_number",
    "phone",
    "mobile_number",
    "mobile_phone",
    "home_phone",
    "work_phone",
  ]);
  const primary_phone = normalizeStoredPhone(phoneRaw);

  const payer_name = guessPayerName(fieldMap);
  const payer_type = guessPayerType(fieldMap);
  const disciplines = resolveFacebookLeadDisciplines(fieldMap);
  const referral_source = firstValue(fieldMap, ["referral_source", "referral source", "how_did_you_hear"]).trim() || null;

  const used = new Set(USED_META_KEYS);
  const extraNotes = freeformNotesFromMap(fieldMap, used);
  const userNotesField =
    firstValue(fieldMap, ["notes", "message", "questions", "comments", "additional_comments", "additional notes"]) ||
    "";

  const leadNotesParts = [
    formId ? `Facebook Lead Ads form ${formId}.` : "Facebook Lead Ads.",
    pageId ? `Page ${pageId}.` : null,
    userNotesField ? `Message: ${userNotesField}` : null,
    extraNotes ? `Fields:\n${extraNotes}` : null,
  ].filter(Boolean);

  const leadNotes = leadNotesParts.join("\n\n").slice(0, 8000) || null;

  const contactIntro =
    ingestionChannel === "csv"
      ? `Imported from Facebook Lead Ads CSV export (${ingestionReceivedAt}).`
      : ingestionChannel === "automation"
        ? `Imported from Facebook Lead Ads via automation (Zapier, Make, or similar) (${ingestionReceivedAt}).`
        : `Imported from Facebook Lead Ads (${ingestionReceivedAt}).`;
  const contactNotes = [contactIntro, leadNotes].filter(Boolean).join("\n\n").slice(0, 8000);

  const { data: contactRow, error: cErr } = await supabase
    .from("contacts")
    .insert({
      first_name: nameParts.first_name,
      last_name: nameParts.last_name,
      full_name: nameParts.full_name,
      primary_phone: primary_phone,
      email: email && email.includes("@") ? email.slice(0, 320) : null,
      notes: contactNotes || null,
    })
    .select("id")
    .single();

  if (cErr || !contactRow?.id) {
    const tag = isAutomationLikeIngestion(ingestionChannel) ? "[facebook-leads] error" : "[facebook-lead] contact insert failed";
    console.warn(tag, { error: cErr?.message, leadgen_id: leadgenId });
    return { ok: false, error: `contact_insert_failed:${cErr?.message ?? "unknown"}`, leadgenId };
  }

  const contactId = String(contactRow.id);

  const externalMeta = {
    source: "facebook" as const,
    ...(ingestionChannel === "automation"
      ? { ingestion_channel: "automation" as const }
      : ingestionChannel === "csv"
        ? { ingestion_channel: "csv_import" as const }
        : {}),
    leadgen_id: leadgenId,
    form_id: formId,
    page_id: pageId,
    webhook_created_time: createdTimeRaw ?? null,
    graph_created_time: graphCreatedTime ?? null,
    raw_webhook_body: rawBodyText.slice(0, 100_000),
    graph_field_data: fieldDataForMeta ?? null,
    intake_request: buildLeadIntakeRequestFromFieldMap(fieldMap),
    ingestion_received_at: ingestionReceivedAt,
    ingestion_completed_at: new Date().toISOString(),
  };

  const { data: newLead, error: lErr } = await supabase
    .from("leads")
    .insert({
      contact_id: contactId,
      source: "facebook",
      status: "new",
      owner_user_id: null,
      external_source_id: leadgenId,
      external_source_metadata: externalMeta,
      payer_name,
      payer_type,
      referral_source,
      service_disciplines: disciplines,
      service_type: disciplines.length > 0 ? disciplines.join(", ") : null,
      notes: leadNotes,
    })
    .select("id")
    .single();

  if (lErr || !newLead?.id) {
    if (isUniqueViolation(lErr)) {
      console.log(
        isAutomationLikeIngestion(ingestionChannel) ? "[facebook-leads] duplicate" : "[facebook-lead] duplicate skipped (unique constraint)",
        { leadgen_id: leadgenId }
      );
      await supabase.from("contacts").delete().eq("id", contactId);
      return { ok: true, duplicateSkipped: true, leadgenId };
    }
    console.warn(
      isAutomationLikeIngestion(ingestionChannel) ? "[facebook-leads] error" : "[facebook-lead] lead insert failed",
      { error: lErr?.message, leadgen_id: leadgenId }
    );
    await supabase.from("contacts").delete().eq("id", contactId);
    return { ok: false, error: `lead_insert_failed:${lErr?.message ?? "unknown"}`, leadgenId };
  }

  const leadId = String(newLead.id);
  if (isAutomationLikeIngestion(ingestionChannel)) {
    console.log("[facebook-leads] inserted", { lead_id: leadId, contact_id: contactId, leadgen_id: leadgenId });
  } else {
    console.log("[facebook-lead] insert ok", { lead_id: leadId, contact_id: contactId, leadgen_id: leadgenId });
  }

  console.log("[lead-intake] facebook_row_ready", {
    lead_id: leadId,
    contact_id_prefix: contactId.slice(0, 8),
    leadgen_id: leadgenId,
    channel: ingestionChannel ?? "meta_graph",
  });

  runPostCreateLeadStaffNotifications(supabase, {
    leadId,
    contactId,
    intakeChannel: "facebook",
  });

  void runFacebookLeadIntroSmsAfterInsert(supabase, {
    leadId,
    contactId,
    fieldMap,
    nameParts,
    primaryPhoneStored: primary_phone,
    ingestionChannel,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/admin/crm/contacts");
  revalidatePath(`/admin/crm/contacts/${contactId}`);
  revalidatePath("/workspace/phone/inbox");
  revalidatePath("/workspace/phone/leads");

  return { ok: true, duplicateSkipped: false, leadId, contactId, leadgenId };
}

/**
 * CSV import path: same insert pipeline as Zapier (`normalizeAutomationFlatFieldMap` + disciplines + metadata).
 */
export async function insertFacebookLeadFromCsvRow(
  supabase: SupabaseClient,
  params: {
    fieldMap: Map<string, string>;
    leadgenId: string;
    rawRowText: string;
  }
): Promise<IngestFacebookLeadgenResult> {
  const m = new Map(params.fieldMap);
  normalizeAutomationFlatFieldMap(m);
  const fieldDataForMeta: GraphFieldDatum[] = Array.from(m.entries()).map(([name, val]) => ({
    name,
    values: [val],
  }));
  return completeFacebookLeadInsertFromFieldMap(supabase, {
    leadgenId: params.leadgenId,
    fieldMap: m,
    fieldDataForMeta,
    pageId: null,
    formId: null,
    createdTimeRaw: undefined,
    graphCreatedTime: null,
    rawBodyText: params.rawRowText.slice(0, 100_000),
    ingestionReceivedAt: new Date().toISOString(),
    ingestionChannel: "csv",
  });
}

async function ingestOneFacebookLeadgen(
  supabase: SupabaseClient,
  params: {
    ev: { value: MetaLeadgenChangeValue; entryPageId?: string };
    rawBodyText: string;
    pageAccessToken: string;
    ingestionReceivedAt: string;
  }
): Promise<IngestFacebookLeadgenResult> {
  const { ev, rawBodyText, pageAccessToken, ingestionReceivedAt } = params;

  const leadgenId = asTrimmedString(ev.value.leadgen_id);
  if (!leadgenId) {
    return { ok: false, error: "missing_leadgen_id" };
  }

  const pageId = asTrimmedString(ev.value.page_id) || ev.entryPageId || null;
  const formId = asTrimmedString(ev.value.form_id) || null;
  const createdTimeRaw = ev.value.created_time;

  const { data: existing } = await leadRowsActiveOnly(
    supabase.from("leads").select("id").eq("source", "facebook").eq("external_source_id", leadgenId)
  ).maybeSingle();

  if (existing?.id) {
    console.log("[facebook-lead] duplicate skipped", { leadgen_id: leadgenId, lead_id: existing.id });
    return { ok: true, duplicateSkipped: true, leadgenId };
  }

  let graph: GraphLeadResponse;
  try {
    graph = await fetchLeadFromGraph(leadgenId, pageAccessToken);
    console.log("[facebook-lead] graph fetch ok", { leadgen_id: leadgenId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[facebook-lead] graph fetch failed", { leadgen_id: leadgenId, error: msg });
    return { ok: false, error: `graph_fetch_failed:${msg}`, leadgenId };
  }

  return completeFacebookLeadInsertFromFieldMap(supabase, {
    leadgenId,
    fieldMap: buildFieldMap(graph.field_data),
    fieldDataForMeta: graph.field_data ?? null,
    pageId,
    formId,
    createdTimeRaw,
    graphCreatedTime: graph.created_time ?? null,
    rawBodyText,
    ingestionReceivedAt,
  });
}

/** JSON body from Zapier, Make, or any HTTP client posting to `/api/integrations/facebook-leads`. */
export type AutomationFacebookLeadPayload = {
  /** Facebook lead ID — dedupe key (`leads.external_source_id`). */
  leadgen_id?: unknown;
  /** Graph API-style rows (e.g. from Facebook Lead Ads field export). */
  field_data?: unknown;
  /** Flat map, e.g. `{ "full_name": "...", "email": "..." }` (Zapier-friendly). */
  fields?: unknown;
  form_id?: unknown;
  page_id?: unknown;
  created_time?: unknown;
};

/** @deprecated Use `AutomationFacebookLeadPayload`. */
export type MakeFacebookLeadPayload = AutomationFacebookLeadPayload;

export async function ingestFacebookLeadFromAutomationPayload(
  supabase: SupabaseClient,
  params: { webhookPayload: AutomationFacebookLeadPayload; rawBodyText: string }
): Promise<IngestFacebookLeadgenResult> {
  const { webhookPayload, rawBodyText } = params;
  const ingestionReceivedAt = new Date().toISOString();

  const leadgenId = asTrimmedString(webhookPayload.leadgen_id);
  if (!leadgenId) {
    return { ok: false, error: "missing_leadgen_id" };
  }

  const { data: existing } = await leadRowsActiveOnly(
    supabase.from("leads").select("id").eq("source", "facebook").eq("external_source_id", leadgenId)
  ).maybeSingle();

  if (existing?.id) {
    console.log("[facebook-leads] duplicate", { leadgen_id: leadgenId, lead_id: existing.id });
    return { ok: true, duplicateSkipped: true, leadgenId };
  }

  const fd = webhookPayload.field_data;
  const flat = webhookPayload.fields;

  let fieldMap: Map<string, string>;
  let fieldDataForMeta: GraphFieldDatum[] | null = null;

  if (Array.isArray(fd) && fd.length > 0) {
    fieldDataForMeta = fd as GraphFieldDatum[];
    fieldMap = buildFieldMap(fieldDataForMeta);
  } else if (flat && typeof flat === "object" && !Array.isArray(flat)) {
    fieldMap = buildFieldMapFromFlatRecord(flat as Record<string, unknown>);
  } else {
    return { ok: false, error: "missing_field_data_or_fields", leadgenId };
  }

  normalizeAutomationFlatFieldMap(fieldMap);

  const formId = asTrimmedString(webhookPayload.form_id) || null;
  const pageId = asTrimmedString(webhookPayload.page_id) || null;
  const createdTimeRaw = webhookPayload.created_time as number | string | undefined;

  return completeFacebookLeadInsertFromFieldMap(supabase, {
    leadgenId,
    fieldMap,
    fieldDataForMeta,
    pageId,
    formId,
    createdTimeRaw,
    graphCreatedTime: null,
    rawBodyText,
    ingestionReceivedAt,
    ingestionChannel: "automation",
  });
}

/** @deprecated Use `ingestFacebookLeadFromAutomationPayload`. */
export const ingestFacebookLeadFromMakePayload = ingestFacebookLeadFromAutomationPayload;

/**
 * Idempotent: same Meta leadgen_id maps to one CRM row via (source, external_source_id).
 * Processes every `leadgen` change in the webhook payload.
 */
export async function ingestFacebookLeadFromWebhookPayload(
  supabase: SupabaseClient,
  params: {
    webhookPayload: MetaWebhookBody;
    rawBodyText: string;
    pageAccessToken: string;
  }
): Promise<IngestFacebookLeadgenResult[]> {
  const { webhookPayload, rawBodyText, pageAccessToken } = params;
  const ingestionReceivedAt = new Date().toISOString();

  if (webhookPayload.object !== "page") {
    return [{ ok: false, error: "ignored_object_not_page" }];
  }

  const entries = Array.isArray(webhookPayload.entry) ? webhookPayload.entry : [];
  const leadgenEvents: Array<{ value: MetaLeadgenChangeValue; entryPageId?: string }> = [];

  for (const ent of entries) {
    const changes = Array.isArray(ent.changes) ? ent.changes : [];
    for (const ch of changes) {
      if (asTrimmedString(ch.field).toLowerCase() !== "leadgen") continue;
      const value = ch.value;
      if (!value || typeof value !== "object") continue;
      leadgenEvents.push({ value, entryPageId: asTrimmedString(ent.id) });
    }
  }

  if (leadgenEvents.length === 0) {
    return [];
  }

  const out: IngestFacebookLeadgenResult[] = [];
  for (const ev of leadgenEvents) {
    const r = await ingestOneFacebookLeadgen(supabase, {
      ev,
      rawBodyText,
      pageAccessToken,
      ingestionReceivedAt,
    });
    out.push(r);
  }
  return out;
}

/** Public POST body for `/api/leads/facebook` (partner JSON integration). */
export type FacebookPartnerStandardPayload = {
  name?: unknown;
  phone?: unknown;
  email?: unknown;
  zip?: unknown;
  notes?: unknown;
  medicare?: unknown;
  service?: unknown;
  source?: unknown;
  campaign?: unknown;
};

function asNonEmptyTrimmedString(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim();
}

function buildPartnerStandardFieldMap(payload: FacebookPartnerStandardPayload): Map<string, string> {
  const m = new Map<string, string>();
  const add = (k: string, v: unknown) => {
    if (v === null || v === undefined) return;
    const s =
      typeof v === "string"
        ? v.trim()
        : typeof v === "number" || typeof v === "boolean"
          ? String(v)
          : "";
    if (s) m.set(k, s);
  };
  const name = asNonEmptyTrimmedString(payload.name);
  if (name) {
    add("name", name);
    add("full_name", name);
  }
  add("email", payload.email);
  add("zip", payload.zip);
  add("zip_code", payload.zip);
  add("notes", payload.notes);
  add("service_needed", payload.service);
  add("service", payload.service);
  if (payload.medicare !== null && payload.medicare !== undefined && String(payload.medicare).trim() !== "") {
    add(
      "medicare",
      typeof payload.medicare === "boolean" ? (payload.medicare ? "yes" : "no") : String(payload.medicare)
    );
  }
  add("referral_source", payload.source);
  add("source_tag", payload.source);
  add("campaign", payload.campaign);
  add("how_did_you_hear", payload.source);
  normalizeAutomationFlatFieldMap(m);
  return m;
}

/**
 * CRM insert for standardized Facebook partner JSON (landing page / server-to-server).
 * - `leads.source` = `facebook_ads`
 * - Phone stored as E.164 on `contacts.primary_phone`
 * - Same staff notifications + intro SMS path as other Facebook lead ingestion
 */
export async function ingestFacebookPartnerStandardLead(
  supabase: SupabaseClient,
  params: { payload: FacebookPartnerStandardPayload; rawBodyText: string }
): Promise<{ ok: true; leadId: string; contactId: string } | { ok: false; error: string }> {
  const { payload, rawBodyText } = params;
  const rawPhone = asNonEmptyTrimmedString(payload.phone);
  const nameRaw = asNonEmptyTrimmedString(payload.name);
  if (!nameRaw) {
    return { ok: false, error: "missing_name" };
  }
  if (!rawPhone) {
    return { ok: false, error: "missing_phone" };
  }

  const phoneE164 = normalizeDialInputToE164(rawPhone);
  if (!phoneE164 || !isValidE164(phoneE164)) {
    return { ok: false, error: "invalid_phone" };
  }

  const fieldMap = buildPartnerStandardFieldMap(payload);
  const nameParts = parseNameParts(fieldMap);

  const emailRaw = asNonEmptyTrimmedString(payload.email);
  const email = emailRaw && emailRaw.includes("@") ? emailRaw.slice(0, 320) : null;

  const zip = asNonEmptyTrimmedString(payload.zip) || null;

  const payer_name = guessPayerName(fieldMap);
  const payer_type = guessPayerType(fieldMap);
  const disciplines = resolveFacebookLeadDisciplines(fieldMap);
  const referral_from_field = asNonEmptyTrimmedString(payload.source);
  const referral_source = referral_from_field || null;

  const campaign = asNonEmptyTrimmedString(payload.campaign);
  const userNotes = asNonEmptyTrimmedString(payload.notes);
  const serviceLine = asNonEmptyTrimmedString(payload.service);
  const medicareLine =
    payload.medicare !== null && payload.medicare !== undefined && String(payload.medicare).trim() !== ""
      ? typeof payload.medicare === "boolean"
        ? payload.medicare
          ? "Yes"
          : "No"
        : String(payload.medicare).trim()
      : "";

  const leadNotesParts = [
    "Facebook partner API lead.",
    userNotes ? `Notes: ${userNotes}` : null,
    serviceLine ? `Service: ${serviceLine}` : null,
    campaign ? `Campaign: ${campaign}` : null,
    referral_from_field ? `Attribution source: ${referral_from_field}` : null,
    medicareLine ? `Medicare: ${medicareLine}` : null,
  ].filter(Boolean);

  const leadNotes = leadNotesParts.join("\n\n").slice(0, 8000) || null;

  const ingestionReceivedAt = new Date().toISOString();
  const contactIntro = `Submitted via Facebook partner API (${ingestionReceivedAt}).`;
  const contactNotes = [contactIntro, leadNotes].filter(Boolean).join("\n\n").slice(0, 8000);

  const { data: contactRow, error: cErr } = await supabase
    .from("contacts")
    .insert({
      first_name: nameParts.first_name,
      last_name: nameParts.last_name,
      full_name: nameParts.full_name,
      primary_phone: phoneE164,
      email,
      zip,
      notes: contactNotes || null,
    })
    .select("id")
    .single();

  if (cErr || !contactRow?.id) {
    console.warn("[facebook-partner-api] contact insert failed", { error: cErr?.message });
    return { ok: false, error: `contact_insert_failed:${cErr?.message ?? "unknown"}` };
  }

  const contactId = String(contactRow.id);

  const externalMeta = {
    source: "facebook_ads" as const,
    ingestion_channel: "partner_api" as const,
    partner_source: referral_from_field || null,
    partner_campaign: campaign || null,
    raw_body_preview: rawBodyText.slice(0, 100_000),
    intake_request: buildLeadIntakeRequestFromFieldMap(fieldMap),
    ingestion_received_at: ingestionReceivedAt,
    ingestion_completed_at: new Date().toISOString(),
  };

  const { data: newLead, error: lErr } = await supabase
    .from("leads")
    .insert({
      contact_id: contactId,
      source: "facebook_ads",
      status: "new",
      owner_user_id: null,
      external_source_id: null,
      external_source_metadata: externalMeta,
      payer_name,
      payer_type,
      referral_source,
      service_disciplines: disciplines,
      service_type: disciplines.length > 0 ? disciplines.join(", ") : null,
      notes: leadNotes,
    })
    .select("id")
    .single();

  if (lErr || !newLead?.id) {
    console.warn("[facebook-partner-api] lead insert failed", { error: lErr?.message });
    await supabase.from("contacts").delete().eq("id", contactId);
    return { ok: false, error: `lead_insert_failed:${lErr?.message ?? "unknown"}` };
  }

  const leadId = String(newLead.id);

  const { error: actErr } = await supabase.from("lead_activities").insert({
    lead_id: leadId,
    event_type: LEAD_ACTIVITY_EVENT.facebook_lead_submitted,
    body: "Facebook Lead Submitted",
    metadata: { channel: "facebook_ads_partner_api" },
    created_by_user_id: null,
    deletable: false,
  });
  if (actErr) {
    console.warn("[facebook-partner-api] lead_activities insert failed", actErr.message);
  }

  console.log("[lead-intake] facebook_partner_api_row_ready", {
    lead_id: leadId,
    contact_id_prefix: contactId.slice(0, 8),
  });

  runPostCreateLeadStaffNotifications(supabase, {
    leadId,
    contactId,
    intakeChannel: "facebook_ads",
  });

  void runFacebookLeadIntroSmsAfterInsert(supabase, {
    leadId,
    contactId,
    fieldMap,
    nameParts,
    primaryPhoneStored: phoneE164,
    ingestionChannel: undefined,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/admin/crm/contacts");
  revalidatePath(`/admin/crm/contacts/${contactId}`);
  revalidatePath("/workspace/phone/inbox");
  revalidatePath("/workspace/phone/leads");

  return { ok: true, leadId, contactId };
}
