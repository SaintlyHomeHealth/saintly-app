/**
 * Generate a text PDF from the Tango Lerma fixture and run extract + parse pipeline.
 * Run: NODE_OPTIONS='--conditions=react-server' npx tsx scripts/verify-patient-referral-pdf-pipeline.ts
 */

import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV ??= "development";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = join(__dirname, "../src/lib/crm/patient-referral/fixtures/tango-lerma-auth.txt");
const OUT_PDF = join(__dirname, "../src/lib/crm/patient-referral/fixtures/tango-lerma-auth.pdf");

async function main() {
  const text = readFileSync(FIXTURE_PATH, "utf8");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([612, 792]);
  const lines = text.split("\n");
  let y = 760;
  for (const line of lines) {
    if (!line.trim()) continue;
    page.drawText(line, { x: 48, y, size: 10, font, color: rgb(0.1, 0.1, 0.15) });
    y -= 14;
  }
  const buffer = Buffer.from(await doc.save());
  writeFileSync(OUT_PDF, buffer);

  const { runPatientReferralExtractPipeline } = await import("../src/lib/crm/patient-referral/extract-pipeline");
  const pipeline = await runPatientReferralExtractPipeline(buffer, "Auth Notification_20260619_151118 Lerma.pdf", {
    mimeType: "application/pdf",
    referralSourceType: "tango_dina",
  });

  console.log("extractedTextLength:", pipeline.extractedTextLength);
  console.log("first 500 chars:\n", pipeline.textPreview);
  console.log("parsed ok:", pipeline.ok);
  console.log("patient:", pipeline.suggestions?.first_name, pipeline.suggestions?.last_name);

  assert.ok((pipeline.extractedTextLength ?? 0) >= 50, "PDF text extraction should return usable text");
  assert.equal(pipeline.ok, true, "pipeline should succeed");
  assert.equal(pipeline.suggestions?.first_name, "Victor");
  assert.equal(pipeline.suggestions?.last_name, "Lerma");
  assert.equal(pipeline.suggestions?.authorization_number, "06182026DOM737572");
  assert.equal(pipeline.suggestions?.skilled_nursing_visits, 4);

  console.log("verify-patient-referral-pdf-pipeline: ok");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
