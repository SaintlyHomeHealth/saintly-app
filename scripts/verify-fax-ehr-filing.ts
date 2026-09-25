/**
 * Pure checks for Fax Center Alora filing helpers (record name, filename, unfiled rules).
 * Run: npx tsx scripts/verify-fax-ehr-filing.ts
 */
import assert from "node:assert/strict";

import {
  contentDispositionAttachment,
  ehrPatientNameFromDisplayTitle,
  faxPdfFilename,
  faxVisibleRecordName,
  isUnfiledInboundFax,
  normalizeFaxDisplayTitle,
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
assert.equal(parseFaxFilingBucket(""), "all");
assert.equal(parseFaxFilingBucket("all"), "all");
assert.equal(parseFaxFilingBucket("unfiled"), "unfiled");
assert.equal(parseFaxFilingBucket("filed"), "filed");
assert.equal(parseFaxFilingBucket("no_document"), "no_document");

console.log("verify-fax-ehr-filing: ok");
