/**
 * Resume discipline inference + recruiting option coverage for PTA.
 * Run: npm run verify:recruiting-discipline-parse
 */

import assert from "node:assert/strict";

process.env.NODE_ENV ??= "development";

async function main() {
  const { parseResumePlainText } = await import("../src/lib/recruiting/resume-parse-heuristics.ts");
  const { RECRUITING_DISCIPLINE_OPTIONS } = await import("../src/lib/recruiting/recruiting-options.ts");
  const { recruitingLeadRoleBadge } = await import("../src/lib/recruiting/recruiting-lead-role-display.ts");

  assert.ok(
    RECRUITING_DISCIPLINE_OPTIONS.includes("PTA"),
    "RECRUITING_DISCIPLINE_OPTIONS must include PTA"
  );
  const ptIdx = RECRUITING_DISCIPLINE_OPTIONS.indexOf("PT");
  const ptaIdx = RECRUITING_DISCIPLINE_OPTIONS.indexOf("PTA");
  const otIdx = RECRUITING_DISCIPLINE_OPTIONS.indexOf("OT");
  assert.ok(ptIdx >= 0 && ptaIdx === ptIdx + 1 && otIdx === ptaIdx + 1, "PTA must sit between PT and OT");

  const ptaResume = parseResumePlainText(
    "Alex Morgan\nLicensed PTA\nPhysical Therapist Assistant\n480-555-0100\nalex@example.com"
  );
  assert.equal(ptaResume.discipline?.value, "PTA", "PTA abbreviation maps to PTA");

  const ptaTitleResume = parseResumePlainText(
    "Jordan Lee\nPhysical Therapy Assistant with 3 years home health experience"
  );
  assert.equal(ptaTitleResume.discipline?.value, "PTA", "Physical Therapy Assistant maps to PTA");

  const ptResume = parseResumePlainText("Sam Rivera\nPhysical Therapist\nPT license Arizona");
  assert.equal(ptResume.discipline?.value, "PT", "Physical Therapist maps to PT");

  const ptAbbrResume = parseResumePlainText("Casey Kim\nPT · DPT · Phoenix AZ");
  assert.equal(ptAbbrResume.discipline?.value, "PT", "PT abbreviation maps to PT");

  const ptaNotPt = parseResumePlainText("Taylor Brooks\nPTA · Maricopa County");
  assert.notEqual(ptaNotPt.discipline?.value, "PT", "PTA must not map to PT");

  const rnFirst = parseResumePlainText("Chris Nguyen\nRN BSN with PTA mentorship experience");
  assert.equal(rnFirst.discipline?.value, "RN", "RN wins over PTA mention in lower-priority context");

  const stStreet = parseResumePlainText("123 Main St\nPhysical Therapist Assistant\nPTA");
  assert.equal(stStreet.discipline?.value, "PTA", "PTA wins over incidental ST token (e.g. street suffix)");

  assert.equal(
    recruitingLeadRoleBadge({ license_status: "PTA" }),
    "PTA",
    "recruiting lead badge recognizes PTA"
  );
  assert.equal(
    recruitingLeadRoleBadge({ license_status: "Physical Therapist Assistant" }),
    "PTA",
    "recruiting lead badge recognizes Physical Therapist Assistant"
  );
  assert.equal(
    recruitingLeadRoleBadge({ license_status: "Physical Therapist" }),
    "PT",
    "recruiting lead badge recognizes Physical Therapist as PT"
  );

  console.log("verify-recruiting-discipline-parse: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
