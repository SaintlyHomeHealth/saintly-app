/**
 * One-time correction: restore misclassified patient leads from recruiting pipeline.
 * Run: npm run restore:misclassified-patient-leads
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";

import { restorePatientLeadFromRecruiting } from "../src/lib/crm/restore-patient-lead-from-recruiting";

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

const TARGET_NAMES = ["Susan Harris", "Holly Dewees", "William Gross"] as const;
const PROTECTED_NAMES = ["Brad Mizokami", "Krista Ulat", "Scheneley Little"] as const;

type Summary = {
  found: number;
  restored: number;
  deletedRecruiting: number;
  skipped: number;
  skippedReasons: Record<string, number>;
};

function normName(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function bumpReason(summary: Summary, reason: string) {
  summary.skipped += 1;
  summary.skippedReasons[reason] = (summary.skippedReasons[reason] ?? 0) + 1;
}

async function main() {
  const summary: Summary = {
    found: 0,
    restored: 0,
    deletedRecruiting: 0,
    skipped: 0,
    skippedReasons: {},
  };

  const { data: rows, error } = await supabaseAdmin
    .from("facebook_recruiting_leads")
    .select("id, full_name")
    .order("created_at", { ascending: true });

  if (error) {
    console.error("fetch failed:", error.message);
    process.exit(1);
  }

  const targetSet = new Set(TARGET_NAMES.map((n) => normName(n)));
  const protectedSet = new Set(PROTECTED_NAMES.map((n) => normName(n)));

  const matches = (rows ?? []).filter((row) => {
    const name = normName((row as { full_name?: string | null }).full_name);
    if (protectedSet.has(name)) return false;
    return targetSet.has(name);
  });

  summary.found = matches.length;

  for (const row of matches) {
    const leadId = String((row as { id: string }).id);
    const fullName = String((row as { full_name?: string | null }).full_name ?? "").trim();

    if (!TARGET_NAMES.some((n) => normName(n) === normName(fullName))) {
      bumpReason(summary, "name_not_in_target_list");
      continue;
    }

    const result = await restorePatientLeadFromRecruiting(supabaseAdmin, leadId, {
      restoredReason: "misclassified_patient_lead",
      skipNotifications: true,
    });

    if (!result.ok) {
      if (result.error === "already_restored") {
        bumpReason(summary, "already_restored");
      } else {
        bumpReason(summary, result.error);
      }
      continue;
    }

    summary.restored += 1;
    if (result.deletedRecruiting) summary.deletedRecruiting += 1;
    console.log(`restored ${fullName} -> CRM lead ${result.crmLeadId}`);
  }

  for (const protectedName of PROTECTED_NAMES) {
    const stillThere = (rows ?? []).some(
      (row) => normName((row as { full_name?: string | null }).full_name) === normName(protectedName)
    );
    if (!stillThere) {
      console.warn(`warning: protected recruiting lead not found: ${protectedName}`);
    }
  }

  console.log("restore:misclassified-patient-leads complete", summary);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
