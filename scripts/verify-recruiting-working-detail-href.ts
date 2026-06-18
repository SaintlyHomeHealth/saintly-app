/**
 * Assertions for recruiting working-detail href helpers.
 * Run: npx tsx scripts/verify-recruiting-working-detail-href.ts
 */

import assert from "node:assert/strict";

import {
  buildAdminRecruitingCandidateDetailHref,
  buildAdminRecruitingWorkingDetailHref,
} from "../src/lib/recruiting/recruiting-working-detail-href";

function testWorkingDetailHref() {
  assert.equal(
    buildAdminRecruitingWorkingDetailHref("lead-1", "candidate-1"),
    "/admin/recruiting/candidate-1"
  );
  assert.equal(
    buildAdminRecruitingWorkingDetailHref("lead-1", null),
    "/admin/recruiting/leads/lead-1"
  );
  assert.equal(
    buildAdminRecruitingWorkingDetailHref("lead-1", "", { tab: "resume_uploads", page: 2 }),
    "/admin/recruiting/leads/lead-1?tab=resume_uploads&page=2"
  );
  assert.equal(
    buildAdminRecruitingWorkingDetailHref("lead-1", "candidate-1", { q: "regina" }),
    "/admin/recruiting/candidate-1?q=regina"
  );
  assert.equal(
    buildAdminRecruitingCandidateDetailHref("candidate-1", { status: "new" }),
    "/admin/recruiting/candidate-1?status=new"
  );
}

testWorkingDetailHref();
console.log("verify-recruiting-working-detail-href: ok");
