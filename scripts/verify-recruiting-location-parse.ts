/**
 * Resume location / coverage parsing regression tests.
 * Run: npm run verify:recruiting-location-parse
 */

import assert from "node:assert/strict";

process.env.NODE_ENV ??= "development";

async function main() {
  const { parseResumePlainText } = await import("../src/lib/recruiting/resume-parse-heuristics.ts");
  const { extractResumeLocation } = await import("../src/lib/recruiting/resume-location-extract.ts");

  const phoenixHeader = parseResumePlainText(`Alex Morgan, RN
Phoenix, AZ 85016
480-555-0100
alex@example.com`);
  assert.equal(phoenixHeader.city?.value, "Phoenix", "city from contact header");
  assert.equal(phoenixHeader.state?.value, "AZ", "state from contact header");
  assert.equal(phoenixHeader.zip?.value, "85016", "zip from contact header");
  assert.ok(phoenixHeader.city?.confidence !== "low", "city confidence should not be low");

  const coverage = parseResumePlainText(`Jamie Lee, PTA
480-555-0199
Serving Phoenix, Mesa, Tempe, Chandler and Scottsdale`);
  assert.equal(
    coverage.coverage_area?.value,
    "Phoenix, Mesa, Tempe, Chandler, Scottsdale",
    "coverage area from serving line"
  );

  const educationLocation = parseResumePlainText(`Kristina Boldt
402-210-3264
Kboldt0108@gmail.com
Education
Nebraska Methodist College, Omaha, NE
Bachelor of Science in Nursing`);
  assert.equal(educationLocation.city?.value, undefined, "must not use school city as candidate city");
  assert.equal(educationLocation.state?.value, undefined, "must not use school state as candidate state");
  assert.ok(
    (educationLocation._meta?.parserDebug?.rejectedCandidates ?? []).some((line) => /omaha/i.test(line)),
    "Omaha school line should appear in rejected candidates"
  );
  assert.equal(educationLocation.education?.value?.includes("Nebraska Methodist College"), true, "education section captured");

  const eduOnly = extractResumeLocation(`Education
Nebraska Methodist College, Omaha, NE`);
  assert.equal(eduOnly.city?.value, undefined, "education-only resume has no contact location");
  assert.equal(eduOnly.state?.value, undefined);

  const tempeZip = parseResumePlainText(`Taylor Brooks
85282
602-555-0100`);
  assert.equal(tempeZip.city?.value, "Tempe", "ZIP lookup fills Tempe");
  assert.equal(tempeZip.state?.value, "AZ", "ZIP lookup fills AZ");
  assert.equal(tempeZip.zip?.value, "85282");

  console.log("verify-recruiting-location-parse: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
