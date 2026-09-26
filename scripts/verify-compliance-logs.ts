/**
 * Assertions for compliance period, checklist status, and QAPI incident counts.
 * Run: npx tsx scripts/verify-compliance-logs.ts
 */

import assert from "node:assert/strict";

import { quarterBounds, periodFromYmd, quarterRangeIso, monthBounds } from "../src/lib/compliance/period";
import {
  checklistStatus,
  countsFromIncidentTypes,
  qapiCountsDiffer,
  rollupQuarter,
} from "../src/lib/compliance/status";

function testQuarterBounds() {
  assert.deepEqual(quarterBounds(2026, 1), { start: "2026-01-01", end: "2026-03-31" });
  assert.deepEqual(quarterBounds(2026, 2), { start: "2026-04-01", end: "2026-06-30" });
  assert.deepEqual(quarterBounds(2026, 3), { start: "2026-07-01", end: "2026-09-30" });
  assert.deepEqual(quarterBounds(2026, 4), { start: "2026-10-01", end: "2026-12-31" });
  assert.deepEqual(periodFromYmd("2026-09-23"), { year: 2026, quarter: 3 });
  assert.equal(monthBounds(2026, 2).end, "2026-02-28");
  const range = quarterRangeIso(2026, 3);
  assert.ok(Date.parse(range.start) < Date.parse(range.end));
}

function testChecklistStatus() {
  assert.equal(
    checklistStatus({ finalized: true, notApplicable: false, year: 2026, quarter: 3, todayYmd: "2026-09-23" }),
    "complete"
  );
  assert.equal(
    checklistStatus({ finalized: false, notApplicable: false, year: 2026, quarter: 3, todayYmd: "2026-09-23" }),
    "due_soon"
  );
  assert.equal(
    checklistStatus({ finalized: false, notApplicable: false, year: 2026, quarter: 2, todayYmd: "2026-09-23" }),
    "not_complete"
  );
  assert.equal(
    checklistStatus({ finalized: false, notApplicable: false, year: 2026, quarter: 4, todayYmd: "2026-09-23" }),
    "not_applicable"
  );
  assert.equal(
    checklistStatus({ finalized: false, notApplicable: true, year: 2026, quarter: 2, todayYmd: "2026-09-23" }),
    "not_applicable"
  );
}

function testRollup() {
  assert.equal(
    rollupQuarter({
      items: ["due_soon", "due_soon", "due_soon", "due_soon", "due_soon"],
      hasActivity: false,
      onCallReady: false,
      quarterEnded: false,
    }),
    "not_started"
  );
  assert.equal(
    rollupQuarter({
      items: ["complete", "complete", "complete", "complete", "complete"],
      hasActivity: true,
      onCallReady: false,
      quarterEnded: false,
    }),
    "complete"
  );
  assert.equal(
    rollupQuarter({
      items: ["complete", "complete", "complete", "complete", "complete"],
      hasActivity: true,
      onCallReady: false,
      quarterEnded: true,
    }),
    "needs_attention"
  );
  assert.equal(
    rollupQuarter({
      items: ["complete", "not_complete", "complete", "complete", "due_soon"],
      hasActivity: true,
      onCallReady: true,
      quarterEnded: false,
    }),
    "needs_attention"
  );
}

function testQapiCounts() {
  const counts = countsFromIncidentTypes([
    "hospitalization",
    "hospitalization",
    "fall",
    "complaint",
    "staff_issue",
    "other",
  ]);
  assert.equal(counts.hospitalizations, 2);
  assert.equal(counts.falls, 1);
  assert.equal(counts.complaints, 1);
  assert.equal(counts.er_visits, 0);
  assert.equal(counts.infections, 0);
  assert.equal(qapiCountsDiffer({ hospitalizations: 2, falls: 1, complaints: 1 }, counts), false);
  assert.equal(qapiCountsDiffer({ hospitalizations: 5 }, counts), true);
}

testQuarterBounds();
testChecklistStatus();
testRollup();
testQapiCounts();
console.log("compliance log checks passed");
