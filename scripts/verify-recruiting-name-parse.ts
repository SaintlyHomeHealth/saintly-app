/**
 * Resume name parsing regression tests (Kristina Boldt / Nebraska Methodist College).
 * Run: npm run verify:recruiting-name-parse
 */

import assert from "node:assert/strict";

process.env.NODE_ENV ??= "development";

const KRISTINA_RESUME = `Kristina Boldt
RN & PMHNP Graduate Student
402-210-3264
Kboldt0108@gmail.com
Education
Nebraska Methodist College
Bachelor of Science in Nursing`;

async function main() {
  const { parseResumePlainText } = await import("../src/lib/recruiting/resume-parse-heuristics.ts");
  const { extractCandidateName } = await import("../src/lib/recruiting/resume-name-extract.ts");

  const parsed = parseResumePlainText(KRISTINA_RESUME);
  assert.equal(parsed.first_name?.value, "Kristina", "first_name should be Kristina");
  assert.equal(parsed.last_name?.value, "Boldt", "last_name should be Boldt");
  assert.equal(parsed.full_name?.value, "Kristina Boldt", "full_name should be Kristina Boldt");
  assert.equal(parsed.phone?.value, "(402) 210-3264", "phone should parse from header");
  assert.equal(parsed.email?.value, "Kboldt0108@gmail.com", "email should parse from header");
  assert.equal(parsed.discipline?.value, "RN", "discipline should be RN from title line");

  assert.notEqual(parsed.first_name?.value, "Nebraska", "must not use school as first name");
  assert.notEqual(parsed.last_name?.value, "Methodist College", "must not use school as last name");

  assert.ok(parsed.first_name?.confidence !== "low", "name confidence should not be low");
  assert.ok(parsed._meta?.parserDebug?.parsedName === "Kristina Boldt", "parser debug name");
  assert.equal(parsed.city?.value, undefined, "city should stay blank without contact location");
  assert.equal(parsed.state?.value, undefined, "state should stay blank without contact location");
  assert.equal(parsed.zip?.value, undefined, "zip should stay blank without contact location");

  const educationFirst = `Education
Nebraska Methodist College
Bachelor of Science in Nursing
Kristina Boldt
402-210-3264
Kboldt0108@gmail.com`;
  const eduFirst = extractCandidateName(educationFirst);
  assert.equal(eduFirst.first?.value, undefined, "no name when only content is after Education heading");
  assert.equal(eduFirst.debug.parsedName, null);

  const institutionOnly = extractCandidateName(`Nebraska Methodist College\nBachelor of Science in Nursing`);
  assert.equal(institutionOnly.first?.value, undefined, "institution line must never become a name");

  console.log("verify-recruiting-name-parse: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
