import "server-only";

import { revalidatePath } from "next/cache";

import type { SupabaseClient } from "@supabase/supabase-js";

import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { isKnownPayerBroadCategory } from "@/lib/crm/payer-type-options";
import { isValidServiceDisciplineCode } from "@/lib/crm/service-disciplines";
import { normalizePhone } from "@/lib/phone/us-phone-format";

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

type GraphFieldDatum = { name?: string; values?: string[] };

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

  const fieldMap = buildFieldMap(graph.field_data);
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
  const disciplines = guessDisciplines(fieldMap);
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

  /** Shown on lead detail (contact notes); `leads.notes` mirrors for any future lead-level UI. */
  const contactNotes = [`Imported from Facebook Lead Ads (${ingestionReceivedAt}).`, leadNotes].filter(Boolean).join("\n\n").slice(0, 8000);

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
    console.warn("[facebook-lead] contact insert failed", { error: cErr?.message, leadgen_id: leadgenId });
    return { ok: false, error: `contact_insert_failed:${cErr?.message ?? "unknown"}`, leadgenId };
  }

  const contactId = String(contactRow.id);

  const externalMeta = {
    source: "facebook" as const,
    leadgen_id: leadgenId,
    form_id: formId,
    page_id: pageId,
    webhook_created_time: createdTimeRaw ?? null,
    graph_created_time: graph.created_time ?? null,
    raw_webhook_body: rawBodyText.slice(0, 100_000),
    graph_field_data: graph.field_data ?? null,
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
      service_disciplines: disciplines.length > 0 ? disciplines : null,
      service_type: disciplines.length > 0 ? disciplines.join(", ") : null,
      notes: leadNotes,
    })
    .select("id")
    .single();

  if (lErr || !newLead?.id) {
    if (isUniqueViolation(lErr)) {
      console.log("[facebook-lead] duplicate skipped (unique constraint)", { leadgen_id: leadgenId });
      await supabase.from("contacts").delete().eq("id", contactId);
      return { ok: true, duplicateSkipped: true, leadgenId };
    }
    console.warn("[facebook-lead] lead insert failed", { error: lErr?.message, leadgen_id: leadgenId });
    await supabase.from("contacts").delete().eq("id", contactId);
    return { ok: false, error: `lead_insert_failed:${lErr?.message ?? "unknown"}`, leadgenId };
  }

  const leadId = String(newLead.id);
  console.log("[facebook-lead] insert ok", { lead_id: leadId, contact_id: contactId, leadgen_id: leadgenId });

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath(`/admin/crm/leads/${leadId}`);
  revalidatePath("/admin/crm/contacts");
  revalidatePath(`/admin/crm/contacts/${contactId}`);

  return { ok: true, duplicateSkipped: false, leadId, contactId, leadgenId };
}

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
