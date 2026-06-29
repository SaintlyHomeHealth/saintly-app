/**
 * Assertions for recruiting leads keyword search OR-clause builder.
 * Run: npx tsx scripts/verify-recruiting-leads-keyword-search.ts
 */

import assert from "node:assert/strict";

import { buildRecruitingLeadKeywordSearchOrClause } from "../src/lib/recruiting/admin-recruiting-leads-keyword-search-clauses";

function testCitySearchClause() {
  const clause = buildRecruitingLeadKeywordSearchOrClause({
    escapedTerms: ["cave creek"],
    qRaw: "cave creek",
    linkedLeadIds: [],
  });
  assert.ok(clause, "expected non-null clause");
  assert.match(clause!, /city\.ilike\.%cave creek%/i);
  assert.match(clause!, /coverage_area\.ilike\.%cave creek%/i);
  assert.match(clause!, /raw_payload::text\.ilike\.%cave creek%/i);
  assert.match(clause!, /notes\.ilike\.%cave creek%/i);
  assert.match(clause!, /source\.ilike\.%cave creek%/i);
}

function testCaseInsensitivePatternsIncludeCity() {
  for (const term of ["cave creek", "Cave Creek", "CAVE CREEK"]) {
    const clause = buildRecruitingLeadKeywordSearchOrClause({
      escapedTerms: [term],
      qRaw: term,
      linkedLeadIds: [],
    });
    assert.match(clause!, new RegExp(`city\\.ilike\\.%${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}%`, "i"));
  }
}

function testLinkedCandidateLeadIds() {
  const clause = buildRecruitingLeadKeywordSearchOrClause({
    escapedTerms: ["jane"],
    qRaw: "jane",
    linkedLeadIds: ["11111111-1111-4111-8111-111111111111"],
  });
  assert.match(clause!, /id\.in\.\(11111111-1111-4111-8111-111111111111\)/);
}

function testPhoneDigitsIncluded() {
  const clause = buildRecruitingLeadKeywordSearchOrClause({
    escapedTerms: ["6025551234"],
    qRaw: "(602) 555-1234",
    linkedLeadIds: [],
  });
  assert.match(clause!, /phone\.ilike\.%6025551234%/);
  assert.match(clause!, /normalized_phone\.ilike\.%6025551234%/);
}

function testEmptyTermsReturnsNull() {
  assert.equal(
    buildRecruitingLeadKeywordSearchOrClause({
      escapedTerms: [],
      qRaw: "",
      linkedLeadIds: [],
    }),
    null
  );
}

testCitySearchClause();
testCaseInsensitivePatternsIncludeCity();
testLinkedCandidateLeadIds();
testPhoneDigitsIncluded();
testEmptyTermsReturnsNull();
console.log("verify-recruiting-leads-keyword-search: ok");
