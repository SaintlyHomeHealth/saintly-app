/**
 * One-time backfill: move legacy recruiting/applicant CRM leads into facebook_recruiting_leads.
 * Run: npm run backfill:crm-recruiting-leads
 *
 * Safe to re-run — dedupes by email, phone, then full name + source.
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { isCrmRecruitingApplicantLead } from "../src/lib/crm/crm-recruiting-lead-exclusion";
import { parseEmploymentApplicationMeta } from "../src/lib/crm/lead-employment-meta";
import {
  normalizeRecruitingEmail,
  normalizeRecruitingPhoneForStorage,
} from "../src/lib/recruiting/recruiting-contact-normalize";

function loadLocalEnv() {
  for (const filename of [".env.local", ".env"]) {
    const path = resolve(process.cwd(), filename);
    if (!existsSync(path)) continue;
    const lines = readFileSync(path, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
      if (!match) continue;
      const [, key, rawValue] = match;
      if (process.env[key]) continue;
      process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
    }
  }
}

loadLocalEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

const LEGACY_CRM_SOURCE = "legacy_crm_lead";
const LEGACY_CRM_FORM_NAME = "Legacy CRM recruiting lead";
const BATCH = 100;

type CrmLeadRow = {
  id: string;
  contact_id: string;
  source: string | null;
  notes: string | null;
  lead_type: string | null;
  status: string | null;
  created_at: string;
  external_source_metadata: unknown;
  contacts:
    | {
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        primary_phone: string | null;
        email: string | null;
        city: string | null;
      }
    | {
        full_name: string | null;
        first_name: string | null;
        last_name: string | null;
        primary_phone: string | null;
        email: string | null;
        city: string | null;
      }[]
    | null;
};

type Summary = {
  scanned: number;
  moved: number;
  linkedExisting: number;
  deletedCrmLead: number;
  markedCrmLead: number;
  skipped: number;
  skippedReasons: Record<string, number>;
};

function bumpReason(summary: Summary, reason: string) {
  summary.skipped += 1;
  summary.skippedReasons[reason] = (summary.skippedReasons[reason] ?? 0) + 1;
}

function contactFromRow(row: CrmLeadRow) {
  const c = row.contacts;
  if (Array.isArray(c)) return c[0] ?? null;
  return c;
}

function buildFullName(row: CrmLeadRow): string {
  const c = contactFromRow(row);
  const fromContact =
    c?.full_name?.trim() ||
    [c?.first_name?.trim(), c?.last_name?.trim()].filter(Boolean).join(" ").trim();
  if (fromContact) return fromContact;
  return "Legacy CRM recruiting applicant";
}

async function findExistingRecruitingLeadId(input: {
  email: string | null;
  phone: string | null;
  fullName: string;
  source: string | null;
}): Promise<string | null> {
  const normalizedEmail = input.email ? normalizeRecruitingEmail(input.email) : null;
  const normalizedPhone = input.phone ? normalizeRecruitingPhoneForStorage(input.phone) : null;

  if (normalizedEmail) {
    const { data } = await supabaseAdmin
      .from("facebook_recruiting_leads")
      .select("id")
      .eq("normalized_email", normalizedEmail)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  if (normalizedPhone) {
    const { data } = await supabaseAdmin
      .from("facebook_recruiting_leads")
      .select("id")
      .eq("normalized_phone", normalizedPhone)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  const name = input.fullName.trim();
  const source = (input.source ?? "").trim();
  if (name) {
    let query = supabaseAdmin.from("facebook_recruiting_leads").select("id, source").ilike("full_name", name).limit(20);
    const { data } = await query;
    for (const row of data ?? []) {
      const rowSource = String((row as { source?: string | null }).source ?? "").trim();
      if (!source || !rowSource || rowSource.toLowerCase() === source.toLowerCase()) {
        return String((row as { id: string }).id);
      }
    }
  }

  return null;
}

async function removeCrmLead(leadId: string, summary: Summary): Promise<void> {
  const { error: hardErr } = await supabaseAdmin.from("leads").delete().eq("id", leadId);
  if (!hardErr) {
    summary.deletedCrmLead += 1;
    return;
  }

  const now = new Date().toISOString();
  const { data: existing } = await supabaseAdmin
    .from("leads")
    .select("external_source_metadata")
    .eq("id", leadId)
    .maybeSingle();

  const prevMeta =
    existing?.external_source_metadata && typeof existing.external_source_metadata === "object"
      ? (existing.external_source_metadata as Record<string, unknown>)
      : {};

  const { error: softErr } = await supabaseAdmin
    .from("leads")
    .update({
      deleted_at: now,
      external_source_metadata: {
        ...prevMeta,
        migrated_to_recruiting: true,
        migrated_to_recruiting_at: now,
      },
    })
    .eq("id", leadId);

  if (softErr) {
    bumpReason(summary, `crm_cleanup_failed:${softErr.message}`);
    return;
  }

  summary.markedCrmLead += 1;
}

async function migrateLead(row: CrmLeadRow, summary: Summary): Promise<void> {
  if (!isCrmRecruitingApplicantLead(row)) {
    bumpReason(summary, "not_recruiting_applicant");
    return;
  }

  const contact = contactFromRow(row);
  const fullName = buildFullName(row);
  const email = contact?.email?.trim() || null;
  const phone = contact?.primary_phone?.trim() || null;
  const normalizedEmail = email ? normalizeRecruitingEmail(email) : null;
  const normalizedPhone = phone ? normalizeRecruitingPhoneForStorage(phone) : null;

  if (!normalizedEmail && !normalizedPhone && fullName === "Legacy CRM recruiting applicant") {
    bumpReason(summary, "missing_contact_identity");
    return;
  }

  const employment = parseEmploymentApplicationMeta(row.external_source_metadata);
  const originalSource = (row.source ?? "").trim() || LEGACY_CRM_SOURCE;
  const formName = employment?.position?.trim() || LEGACY_CRM_FORM_NAME;

  const rawPayloadLatest = {
    pipeline: "recruiting",
    migrated_from: "crm_leads",
    original_crm_lead_id: row.id,
    original_crm_source: row.source ?? null,
    original_crm_status: row.status ?? null,
    original_crm_lead_type: row.lead_type ?? null,
    employment_application: employment,
    contact: {
      first_name: contact?.first_name ?? null,
      last_name: contact?.last_name ?? null,
      city: contact?.city ?? null,
    },
  };

  const recruitingPatch = {
    full_name: fullName,
    phone,
    email,
    city: contact?.city?.trim() || null,
    form_name: formName,
    license_status: employment?.license_number?.trim() || employment?.position?.trim() || null,
    home_health_experience: employment?.years_experience?.trim() || employment?.experience_message?.trim() || null,
    visits_per_week: employment?.preferred_hours?.trim() || null,
    coverage_area: contact?.city?.trim() || null,
    start_date: employment?.available_start_date?.trim() || null,
    lead_type: "recruiting",
    source: originalSource === "other" ? LEGACY_CRM_SOURCE : originalSource,
    normalized_phone: normalizedPhone,
    normalized_email: normalizedEmail,
    notes: row.notes?.trim() || null,
    raw_payload: {
      latest: rawPayloadLatest,
      history: [],
    },
    created_at: row.created_at,
  };

  const existingLeadId = await findExistingRecruitingLeadId({
    email,
    phone,
    fullName,
    source: recruitingPatch.source,
  });

  let recruitingLeadId = existingLeadId;

  if (existingLeadId) {
    const { data: existingRaw } = await supabaseAdmin
      .from("facebook_recruiting_leads")
      .select("raw_payload, notes")
      .eq("id", existingLeadId)
      .maybeSingle();

    const prevPayload =
      existingRaw?.raw_payload && typeof existingRaw.raw_payload === "object"
        ? (existingRaw.raw_payload as { latest?: Record<string, unknown>; history?: unknown[] })
        : null;
    const history = Array.isArray(prevPayload?.history) ? [...prevPayload!.history!] : [];
    if (prevPayload?.latest) {
      history.push({ received_at: new Date().toISOString(), payload: prevPayload.latest });
    }

    const mergedNotes = [existingRaw?.notes, row.notes?.trim()].filter(Boolean).join("\n\n").slice(0, 8000) || null;

    const { error: upErr } = await supabaseAdmin
      .from("facebook_recruiting_leads")
      .update({
        ...recruitingPatch,
        notes: mergedNotes,
        raw_payload: {
          latest: rawPayloadLatest,
          history: history.slice(-20),
        },
      })
      .eq("id", existingLeadId);

    if (upErr) {
      bumpReason(summary, `recruiting_update_failed:${upErr.message}`);
      return;
    }

    summary.linkedExisting += 1;
  } else {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("facebook_recruiting_leads")
      .insert({
        ...recruitingPatch,
        status: "New",
      })
      .select("id")
      .single();

    if (insErr || !inserted?.id) {
      bumpReason(summary, `recruiting_insert_failed:${insErr?.message ?? "unknown"}`);
      return;
    }

    recruitingLeadId = String(inserted.id);
    summary.moved += 1;
  }

  if (!recruitingLeadId) {
    bumpReason(summary, "missing_recruiting_lead_id");
    return;
  }

  await removeCrmLead(row.id, summary);
}

async function main() {
  const summary: Summary = {
    scanned: 0,
    moved: 0,
    linkedExisting: 0,
    deletedCrmLead: 0,
    markedCrmLead: 0,
    skipped: 0,
    skippedReasons: {},
  };

  let offset = 0;

  for (;;) {
    const { data: rows, error } = await supabaseAdmin
      .from("leads")
      .select(
        "id, contact_id, source, notes, lead_type, status, created_at, external_source_metadata, contacts ( full_name, first_name, last_name, primary_phone, email, city )"
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: true })
      .range(offset, offset + BATCH - 1);

    if (error) {
      console.error("fetch failed:", error.message);
      process.exit(1);
    }

    if (!rows?.length) break;

    for (const row of rows as CrmLeadRow[]) {
      summary.scanned += 1;
      await migrateLead(row, summary);
    }

    offset += rows.length;
    if (rows.length < BATCH) break;
  }

  console.log("backfill:crm-recruiting-leads complete", {
    scanned: summary.scanned,
    moved: summary.moved,
    linkedExisting: summary.linkedExisting,
    deletedCrmLead: summary.deletedCrmLead,
    markedCrmLead: summary.markedCrmLead,
    skipped: summary.skipped,
    skippedReasons: summary.skippedReasons,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
