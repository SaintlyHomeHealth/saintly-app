"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";

import { supabaseAdmin } from "@/lib/admin";
import { facebookCsvRowToFieldMap } from "@/lib/crm/facebook-csv-column-map";
import { parseCsv } from "@/lib/crm/parse-csv";
import { leadRowsActiveOnly } from "@/lib/crm/leads-active";
import { insertFacebookLeadFromCsvRow } from "@/lib/facebook/facebook-lead-ingestion";
import { normalizePhone } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

function normalizePhoneForMatch(raw: string): string {
  const d = normalizePhone(raw);
  if (!d) return "";
  if (d.length === 11 && d.startsWith("1")) return d.slice(1);
  if (d.length === 10) return d;
  if (d.length > 10) return d;
  return d;
}

function firstValueFromMap(map: Map<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = map.get(k);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

function stableFingerprint(phone: string, email: string, fullName: string): string {
  const p = (phone ?? "").replace(/\D/g, "");
  const e = (email ?? "").trim().toLowerCase();
  const n = (fullName ?? "").trim().toLowerCase();
  return createHash("sha256").update(`${p}|${e}|${n}`).digest("hex").slice(0, 32);
}

async function findExistingFacebookLeadIdByExternalSourceId(externalId: string): Promise<string | null> {
  const { data } = await leadRowsActiveOnly(
    supabaseAdmin.from("leads").select("id").eq("source", "facebook").eq("external_source_id", externalId)
  ).maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function findExistingFacebookLeadIdByPhoneOrEmail(
  phoneDigits: string,
  emailLower: string
): Promise<string | null> {
  if (phoneDigits.length >= 10) {
    const { data: contacts } = await supabaseAdmin.from("contacts").select("id").eq("primary_phone", phoneDigits).limit(50);
    for (const c of contacts ?? []) {
      const cid = typeof c.id === "string" ? c.id : String(c.id);
      const { data: lead } = await leadRowsActiveOnly(
        supabaseAdmin.from("leads").select("id").eq("contact_id", cid).eq("source", "facebook")
      ).maybeSingle();
      if (lead?.id) return String(lead.id);
    }
  }
  if (emailLower) {
    const { data: contacts } = await supabaseAdmin
      .from("contacts")
      .select("id")
      .ilike("email", emailLower)
      .limit(50);
    for (const c of contacts ?? []) {
      const cid = typeof c.id === "string" ? c.id : String(c.id);
      const { data: lead } = await leadRowsActiveOnly(
        supabaseAdmin.from("leads").select("id").eq("contact_id", cid).eq("source", "facebook")
      ).maybeSingle();
      if (lead?.id) return String(lead.id);
    }
  }
  return null;
}

export type CsvImportResult = {
  ok: boolean;
  created: number;
  skipped: number;
  skippedEmpty: number;
  skippedDuplicate: number;
  skippedError: number;
  error?: string;
};

export async function importCrmLeadsFromCsv(formData: FormData): Promise<CsvImportResult> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, created: 0, skipped: 0, skippedEmpty: 0, skippedDuplicate: 0, skippedError: 0, error: "forbidden" };
  }

  const file = formData.get("csvFile");
  if (!(file instanceof File)) {
    return { ok: false, created: 0, skipped: 0, skippedEmpty: 0, skippedDuplicate: 0, skippedError: 0, error: "no_file" };
  }

  const text = await file.text();
  const { headers, rows } = parseCsv(text);
  if (headers.length === 0 || rows.length === 0) {
    return { ok: false, created: 0, skipped: 0, skippedEmpty: 0, skippedDuplicate: 0, skippedError: 0, error: "empty_csv" };
  }

  let created = 0;
  let skippedEmpty = 0;
  let skippedDuplicate = 0;
  let skippedError = 0;

  for (let i = 0; i < rows.length; i++) {
    const values = rows[i];
    const rawRowText = JSON.stringify({ row: i + 1, headers, values });
    const fieldMap = facebookCsvRowToFieldMap(headers, values);

    const fullName = firstValueFromMap(fieldMap, ["full_name", "name"]);
    const phoneRaw = firstValueFromMap(fieldMap, ["phone_number", "phone", "mobile_phone", "mobile number"]);
    const emailRaw = firstValueFromMap(fieldMap, ["email", "email_address"]);
    const phoneDigits = normalizePhoneForMatch(phoneRaw);
    const emailLower = emailRaw.includes("@") ? emailRaw.trim().toLowerCase() : "";

    if (!fullName.trim() && phoneDigits.length < 10 && !emailLower) {
      skippedEmpty++;
      continue;
    }

    const externalFromCsv = firstValueFromMap(fieldMap, ["leadgen_id", "lead_id", "id", "lead id"]).trim();
    const leadgenId = externalFromCsv || `csv:${stableFingerprint(phoneDigits, emailLower, fullName)}`;

    if (await findExistingFacebookLeadIdByExternalSourceId(leadgenId)) {
      skippedDuplicate++;
      continue;
    }
    if (!externalFromCsv && (await findExistingFacebookLeadIdByPhoneOrEmail(phoneDigits, emailLower))) {
      skippedDuplicate++;
      continue;
    }

    const result = await insertFacebookLeadFromCsvRow(supabaseAdmin, {
      fieldMap,
      leadgenId,
      rawRowText,
    });

    if (!result.ok) {
      skippedError++;
      console.warn("[csv-import] row failed", { row: i + 1, error: result.error });
      continue;
    }
    if (result.duplicateSkipped) {
      skippedDuplicate++;
    } else {
      created++;
    }
  }

  const skipped = skippedEmpty + skippedDuplicate + skippedError;

  revalidatePath("/admin");
  revalidatePath("/admin/crm/leads");
  revalidatePath("/admin/crm/contacts");

  return {
    ok: true,
    created,
    skipped,
    skippedEmpty,
    skippedDuplicate,
    skippedError,
  };
}
