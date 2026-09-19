/**
 * Prove fax extraction reads past a long cover sheet (Woundtech-style page 1)
 * and finds the patient on page 2. No PHI, no live DB.
 *
 * Run: NODE_OPTIONS='--conditions=react-server' npx tsx scripts/verify-fax-page-extract.ts
 */

import assert from "node:assert/strict";

function coverSheetLines(): string[] {
  const lines = [
    "WOUNDTECH COVER SHEET",
    "From: Woundtech Wound Care Services",
    "Phone: (331) 481-7978",
    "To:",
    "Fax:",
    "Re:",
    "Comments: Please see attached encounter documentation.",
    "CONFIDENTIALITY NOTICE: This facsimile contains confidential information.",
  ];
  // Pad so a naive first-N-characters slice would never reach page 2.
  const pad = "Cover-sheet boilerplate field label and instruction text. ";
  while (lines.join("\n").length < 12_000) {
    lines.push(pad.repeat(2).trim());
  }
  return lines;
}

function encounterPageLines(): string[] {
  return [
    "Wound Care Encounter Note",
    "Referred Date: 09/02/2026",
    "Clinician: Victoria McBerty, Phone: 4806628864",
    "Start Date: 09/11/2026 Place of Service: Patient's Residence / Home (12)",
    "Encounter date: 09/18/2026",
    "Patient Name : Patsy L Sullivan",
    "Patient DOB: 03/14/1948",
    "Active Allergies: NKDA",
    "Visit frequency: 2x/week wound care",
  ];
}

async function buildFixturePdf(): Promise<Buffer> {
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);

  function drawSinglePage(lines: string[], size: number, leading: number) {
    const page = doc.addPage([612, 792]);
    let y = 780;
    for (const line of lines) {
      if (y < 8) break;
      page.drawText(line.slice(0, 140), { x: 18, y, size, font, color: rgb(0.1, 0.1, 0.15) });
      y -= leading;
    }
  }

  drawSinglePage(coverSheetLines(), 6, 7);
  drawSinglePage(encounterPageLines(), 10, 14);
  drawSinglePage(["Orders / signature page", "Electronically signed by Victoria McBerty"], 10, 14);
  return Buffer.from(await doc.save());
}

async function main() {
  const buffer = await buildFixturePdf();
  const { extractFaxDocumentText } = await import("../src/lib/fax/fax-document-text");
  const { heuristicPatientFromFaxPages } = await import("../src/lib/fax/fax-extraction-heuristics");

  const extracted = await extractFaxDocumentText(buffer, { faxId: "c4809067-7251-4bd0-99de-34f79038a1b2", skipOcr: true });

  assert.ok(extracted.pageCount >= 3, `expected 3+ pages, got ${extracted.pageCount}`);
  const page1 = extracted.pages.find((p) => p.page === 1);
  const page2 = extracted.pages.find((p) => p.page === 2);
  assert.ok(page1 && page1.charCount > 1000, "page 1 cover sheet should be long");
  assert.ok(page2 && page2.charCount > 50, "page 2 should have a real text layer");
  assert.match(page2!.text, /Patient Name\s*:/i);
  assert.match(page2!.text, /Patsy L Sullivan/i);
  assert.doesNotMatch(page1!.text, /Patsy L Sullivan/i);

  assert.match(extracted.modelText, /--- Page 2 \(/);
  assert.match(extracted.modelText, /Patsy L Sullivan/);

  const naiveSlice = extracted.pages.map((p) => p.text).join("\n").slice(0, 8_000);
  assert.doesNotMatch(naiveSlice, /Patsy L Sullivan/, "old 8k prefix must miss the page-2 name");
  assert.match(extracted.modelText, /Patsy L Sullivan/, "paged model payload must keep the page-2 name");

  const hit = heuristicPatientFromFaxPages(extracted.pages);
  assert.ok(hit, "heuristic should find a patient");
  assert.equal(hit!.sourcePage, 2);
  assert.equal(hit!.patientName, "Sullivan, Patsy L");
  assert.equal(hit!.patientDob, "1948-03-14");
  assert.notEqual(hit!.patientName.toLowerCase().includes("mcberty"), true);

  const { classifyFaxFailure, isFaxFailureRetryable } = await import("../src/lib/fax/classify-fax-failure");
  assert.equal(classifyFaxFailure("user busy"), "busy");
  assert.equal(classifyFaxFailure("The number is invalid"), "invalid_number");
  assert.equal(isFaxFailureRetryable("busy"), true);
  assert.equal(isFaxFailureRetryable("invalid_number"), false);

  const { selectFaxExtractPages } = await import("../src/lib/fax/fax-document-text");
  assert.deepEqual(selectFaxExtractPages(13), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  assert.deepEqual(selectFaxExtractPages(20), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 19, 20]);

  console.log("verify-fax-page-extract: ok");
  console.log(
    JSON.stringify(
      {
        page_count: extracted.pageCount,
        pages: extracted.pages.map((p) => ({ page: p.page, chars: p.charCount, method: p.method })),
        sourcePage: hit!.sourcePage,
        patientName: hit!.patientName,
        patientDob: hit!.patientDob,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
