/**
 * Pure checks for Fax Center Alora filing helpers (record name, filename, unfiled rules).
 * Run: npx tsx scripts/verify-fax-ehr-filing.ts
 */
import assert from "node:assert/strict";

import { faxArrivedWindow, faxPeriodOrFilter, parseFaxArrivedPreset, resolveFaxMetricPeriod } from "../src/lib/fax/fax-metric-period";
import {
  contentDispositionAttachment,
  ehrPatientNameFromDisplayTitle,
  faxInboxStatus,
  faxPdfFilename,
  faxVisibleRecordName,
  isUnfiledInboundFax,
  normalizeFaxDisplayTitle,
  normalizeFaxStatusNote,
  parseFaxFilingBucket,
  uniqueFaxPdfZipName,
} from "../src/lib/fax/fax-ehr-filing";

const title = "SMITH, JANE - 485 - 09-25-2026";
const normalized = normalizeFaxDisplayTitle(`  ${title}  `);
assert.equal(normalized.ok, true);
assert.equal(normalized.ok && normalized.value, title);
const blank = normalizeFaxDisplayTitle("   ");
assert.equal(blank.ok, true);
assert.equal(blank.ok ? blank.value : "nope", null);
assert.equal(normalizeFaxDisplayTitle("x".repeat(51)).ok, false);
assert.equal(ehrPatientNameFromDisplayTitle(title), "SMITH, JANE");
assert.equal(faxPdfFilename({ displayTitle: title, note: "OCR name" }), `${title}.pdf`);
assert.equal(faxPdfFilename({ displayTitle: "a/b:c*?\"<>|", note: null, faxId: "12345678-aaaa" }), "abc.pdf");
assert.equal(faxPdfFilename({ displayTitle: null, note: "Signed 485", faxId: "abcdef12-zzzz" }), "Signed 485.pdf");
assert.equal(faxPdfFilename({ displayTitle: "CON", note: null }), "fax-CON.pdf");
assert.equal(
  contentDispositionAttachment("SMITH, JANE.pdf").includes('filename="SMITH, JANE.pdf"'),
  true
);
assert.equal(contentDispositionAttachment("SMITH, JANE.pdf").startsWith("attachment;"), true);

const used = new Set<string>();
assert.equal(uniqueFaxPdfZipName(used, "SMITH, JANE.pdf"), "SMITH, JANE.pdf");
assert.equal(uniqueFaxPdfZipName(used, "SMITH, JANE.pdf"), "SMITH, JANE (2).pdf");

assert.equal(
  faxVisibleRecordName({ display_title: title, note: "OCR name", direction: "inbound" }),
  title
);
assert.equal(
  faxVisibleRecordName({ display_title: null, note: "OCR name", direction: "inbound" }),
  "OCR name"
);

const base = {
  direction: "inbound" as const,
  is_archived: false,
  status: "success",
  storage_path: "inbound/a.pdf",
  media_url: null,
  filed_to_ehr_at: null,
};
assert.equal(isUnfiledInboundFax(base), true);
assert.equal(isUnfiledInboundFax({ ...base, status: "failed" }), false);
assert.equal(isUnfiledInboundFax({ ...base, storage_path: "  ", media_url: "" }), false);
assert.equal(isUnfiledInboundFax({ ...base, filed_to_ehr_at: "2026-09-25T00:00:00Z" }), false);
assert.equal(isUnfiledInboundFax({ ...base, direction: "outbound" }), false);
assert.equal(isUnfiledInboundFax({ ...base, inbox_status: "needs_admission" }), false);
assert.equal(isUnfiledInboundFax({ ...base, inbox_status: "junk" }), false);
assert.equal(isUnfiledInboundFax({ ...base, inbox_status: "unfiled", has_fax_document: true, storage_path: "" }), true);
assert.equal(faxInboxStatus({ inbox_status: "wrong_recipient" }), "wrong_recipient");
assert.equal(faxInboxStatus({ filed_to_ehr_at: "2026-09-25T00:00:00Z" }), "filed");
assert.equal(faxInboxStatus({}), "unfiled");
assert.equal(parseFaxFilingBucket(""), "unfiled");
assert.equal(parseFaxFilingBucket("all"), "unfiled");
assert.equal(parseFaxFilingBucket("unfiled"), "unfiled");
assert.equal(parseFaxFilingBucket("filed"), "filed");
assert.equal(parseFaxFilingBucket("needs_admission"), "needs_admission");
assert.equal(parseFaxFilingBucket("wrong_recipient"), "wrong_recipient");
assert.equal(parseFaxFilingBucket("junk"), "junk");
assert.equal(parseFaxFilingBucket("unreadable"), "unreadable");
assert.equal(parseFaxFilingBucket("no_document"), "no_document");
const statusNote = normalizeFaxStatusNote("  call the hospital  ");
assert.equal(statusNote.ok, true);
assert.equal(statusNote.ok && statusNote.value, "call the hospital");
const blankStatusNote = normalizeFaxStatusNote("   ");
assert.equal(blankStatusNote.ok, true);
assert.equal(blankStatusNote.ok ? blankStatusNote.value : "nope", null);
assert.equal(normalizeFaxStatusNote("x".repeat(501)).ok, false);

assert.equal(parseFaxArrivedPreset(""), "today");
assert.equal(parseFaxArrivedPreset("nope"), "today");
assert.equal(parseFaxArrivedPreset("yesterday"), "yesterday");
const arrivedNow = new Date("2026-09-26T18:00:00.000Z");
assert.equal(faxArrivedWindow("today", arrivedNow).startIso, "2026-09-26T07:00:00.000Z");
assert.equal(faxArrivedWindow("today", arrivedNow).endIso, "2026-09-27T07:00:00.000Z");
assert.equal(faxArrivedWindow("yesterday", arrivedNow).startIso, "2026-09-25T07:00:00.000Z");
assert.equal(faxArrivedWindow("yesterday", arrivedNow).endIso, "2026-09-26T07:00:00.000Z");
assert.equal(faxArrivedWindow("week", arrivedNow).startIso, "2026-09-20T07:00:00.000Z");
assert.equal(faxArrivedWindow("week", arrivedNow).endIso, "2026-09-27T07:00:00.000Z");
assert.equal(faxArrivedWindow("all", arrivedNow).startIso, null);
assert.equal(faxArrivedWindow("all", arrivedNow).endIso, null);

const now = new Date("2026-09-26T18:00:00.000Z");
const today = resolveFaxMetricPeriod({ spanRaw: "", dayRaw: "", now });
assert.equal(today.span, "day");
assert.equal(today.anchorYmd, "2026-09-26");
assert.equal(today.todayYmd, "2026-09-26");
assert.equal(today.startIso, "2026-09-26T07:00:00.000Z");
assert.equal(today.endIso, "2026-09-27T07:00:00.000Z");
assert.equal(today.canGoNext, false);
assert.equal(today.label.startsWith("Today · "), true);
assert.equal(today.previousAnchorYmd, "2026-09-25");

const yesterday = resolveFaxMetricPeriod({ spanRaw: "day", dayRaw: "2026-09-25", now });
assert.equal(yesterday.canGoNext, true);
assert.equal(yesterday.nextAnchorYmd, "2026-09-26");
assert.equal(resolveFaxMetricPeriod({ spanRaw: "quarter", dayRaw: "2099-01-01", now }).anchorYmd, "2026-09-26");
assert.equal(resolveFaxMetricPeriod({ spanRaw: "day", dayRaw: "nope", now }).anchorYmd, "2026-09-26");

const week = resolveFaxMetricPeriod({ spanRaw: "week", dayRaw: "2026-09-26", now });
assert.equal(week.startYmd, "2026-09-20");
assert.equal(week.endYmd, "2026-09-27");
assert.equal(week.canGoNext, false);
assert.equal(week.label.startsWith("This week · "), true);
const priorWeek = resolveFaxMetricPeriod({ spanRaw: "week", dayRaw: week.previousAnchorYmd, now });
assert.equal(priorWeek.startYmd, "2026-09-13");
assert.equal(priorWeek.canGoNext, true);

const month = resolveFaxMetricPeriod({ spanRaw: "month", dayRaw: "2026-09-26", now });
assert.equal(month.startYmd, "2026-09-01");
assert.equal(month.endYmd, "2026-10-01");
assert.equal(month.startIso, "2026-09-01T07:00:00.000Z");
assert.equal(month.canGoNext, false);
const january = resolveFaxMetricPeriod({ spanRaw: "month", dayRaw: "2026-01-31", now });
assert.equal(january.previousAnchorYmd, "2025-12-31");
assert.equal(january.nextAnchorYmd, "2026-02-28");

const year = resolveFaxMetricPeriod({ spanRaw: "year", dayRaw: "2024-02-29", now });
assert.equal(year.startYmd, "2024-01-01");
assert.equal(year.endYmd, "2025-01-01");
assert.equal(year.previousAnchorYmd, "2023-02-28");
assert.equal(year.nextAnchorYmd, "2025-02-28");
assert.equal(year.canGoNext, true);

const yearEnd = "2026-09-27T07:00:00.000Z";
assert.equal(
  faxPeriodOrFilter("received_at", today.startIso, today.endIso),
  `and(received_at.gte."${today.startIso}",received_at.lt."${today.endIso}"),and(received_at.is.null,created_at.gte."${today.startIso}",created_at.lt."${today.endIso}")`
);
assert.equal(faxPeriodOrFilter("failed_at", today.startIso, yearEnd).includes("failed_at.gte."), true);

console.log("verify-fax-ehr-filing: ok");
