/**
 * Tango auth parser regression tests (clean + real PDF extract fixtures).
 * Run: npm run verify:patient-referral-tango-parse
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLEAN_FIXTURE = join(__dirname, "../src/lib/crm/patient-referral/fixtures/tango-lerma-auth.txt");
const REAL_FIXTURE = join(__dirname, "../src/lib/crm/patient-referral/fixtures/tango-lerma-real-extract.txt");

const EXPECTED = {
  first_name: "Victor",
  last_name: "Lerma",
  full_name: "Victor Lerma",
  sex: "M",
  date_of_birth: "1973-02-07",
  age: 53,
  phone: "(602) 694-0931",
  address_line_1: "6824 North 183rd Avenue",
  city: "Waddell",
  state: "AZ",
  zip: "85355",
  insurance_name: "Humana",
  member_id: "H67503926",
  mbi: "7W98N55EA40",
  chief_complaint: "Weakness",
  agency_assigned: "Saintly Home Health",
  authorization_bill_type: "Fee for Service",
  authorization_number: "06182026DOM737572",
  requested_soc_date: "2026-06-19",
  referral_received_date: "2026-06-16",
  discharge_date: "2026-06-17",
  ordering_physician_name: "Luca Bertozzi",
  ordering_physician_phone: "(520) 792-1450",
  ordering_physician_fax: "(520) 629-4631",
  pcp_name: "Christian Paul Stockton",
  pcp_phone: "(623) 935-9600",
  pcp_fax: "(623) 935-9602",
  skilled_nursing_visits: 4,
  pt_visits: 0,
  ot_visits: 0,
  st_visits: 0,
  msw_visits: 0,
  hha_visits: 0,
  authorization_effective_start: "2026-06-19",
  authorization_effective_end: "2026-08-17",
} as const;

function assertExpected(parsed: Record<string, unknown>, label: string) {
  for (const [key, value] of Object.entries(EXPECTED)) {
    assert.equal(parsed[key], value, `${label}: ${key}`);
  }
}

async function main() {
  const { parseTangoReferralText } = await import("../src/lib/crm/patient-referral/parse-tango");

  const clean = parseTangoReferralText(readFileSync(CLEAN_FIXTURE, "utf8"), { force: true });
  assert.ok(clean, "clean fixture should parse");
  assertExpected(clean as Record<string, unknown>, "clean");

  const real = parseTangoReferralText(readFileSync(REAL_FIXTURE, "utf8"), { force: true });
  assert.ok(real, "real extract fixture should parse");
  assertExpected(real as Record<string, unknown>, "real");

  console.log("verify-patient-referral-tango-parse: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
