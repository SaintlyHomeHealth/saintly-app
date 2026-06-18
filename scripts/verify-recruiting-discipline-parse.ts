/**
 * Resume discipline inference + recruiting option coverage for PTA, OT, and ST.
 * Run: npm run verify:recruiting-discipline-parse
 */

import assert from "node:assert/strict";

process.env.NODE_ENV ??= "development";

async function main() {
  const { parseResumePlainText } = await import("../src/lib/recruiting/resume-parse-heuristics.ts");
  const { RECRUITING_DISCIPLINE_OPTIONS } = await import("../src/lib/recruiting/recruiting-options.ts");
  const {
    RECRUITING_LEAD_ROLE_FILTER_OPTIONS,
    recruitingLeadRoleBadge,
  } = await import("../src/lib/recruiting/recruiting-lead-role-display.ts");

  assert.ok(
    RECRUITING_DISCIPLINE_OPTIONS.includes("PTA"),
    "RECRUITING_DISCIPLINE_OPTIONS must include PTA"
  );
  assert.ok(RECRUITING_DISCIPLINE_OPTIONS.includes("OT"), "RECRUITING_DISCIPLINE_OPTIONS must include OT");
  assert.ok(RECRUITING_DISCIPLINE_OPTIONS.includes("ST"), "RECRUITING_DISCIPLINE_OPTIONS must include ST");
  assert.ok(RECRUITING_DISCIPLINE_OPTIONS.includes("CNA"), "RECRUITING_DISCIPLINE_OPTIONS must include CNA");

  assert.deepEqual(
    [...RECRUITING_LEAD_ROLE_FILTER_OPTIONS],
    [...RECRUITING_DISCIPLINE_OPTIONS],
    "filter dropdown must match RECRUITING_DISCIPLINE_OPTIONS"
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
  assert.equal(stStreet.discipline?.value, "PTA", "PTA wins over incidental St token (e.g. street suffix)");

  const otTitle = parseResumePlainText(
    "Jamie Ortiz\nOccupational Therapist Registered\nOTR/L · Phoenix, AZ"
  );
  assert.equal(otTitle.discipline?.value, "OT", "Occupational Therapist Registered maps to OT");

  const otDegree = parseResumePlainText("Riley Chen\nMSOT · Board Certified\n480-555-0199");
  assert.equal(otDegree.discipline?.value, "OT", "MSOT maps to OT");

  const otAbbr = parseResumePlainText("Morgan Lee\nOT · Home Health");
  assert.equal(otAbbr.discipline?.value, "OT", "OT abbreviation maps to OT");

  const stTitle = parseResumePlainText("Alex Kim\nSpeech-Language Pathologist\nCCC-SLP");
  assert.equal(stTitle.discipline?.value, "ST", "Speech-Language Pathologist maps to ST");

  const stStreetOnly = parseResumePlainText("123 Main St\nOak Drive St\nPhoenix AZ");
  assert.notEqual(stStreetOnly.discipline?.value, "ST", "Street suffix St must not map to ST");

  const notOther = parseResumePlainText("Taylor Brooks\nnot interested in other roles");
  assert.notEqual(notOther.discipline?.value, "OT", "Incidental 'ot' inside words must not map to OT");

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
  assert.equal(recruitingLeadRoleBadge({ license_status: "OT" }), "OT", "recruiting lead badge recognizes OT");
  assert.equal(
    recruitingLeadRoleBadge({ license_status: "Occupational Therapist" }),
    "OT",
    "recruiting lead badge recognizes Occupational Therapist"
  );
  assert.equal(recruitingLeadRoleBadge({ license_status: "ST" }), "ST", "recruiting lead badge recognizes ST");
  assert.equal(
    recruitingLeadRoleBadge({ license_status: "Speech Therapist" }),
    "ST",
    "recruiting lead badge recognizes Speech Therapist"
  );

  console.log("verify-recruiting-discipline-parse: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
