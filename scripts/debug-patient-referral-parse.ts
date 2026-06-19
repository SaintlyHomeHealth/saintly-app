/**
 * End-to-end patient referral PDF extract + parse — prints real metrics for debugging.
 *
 * Usage (from repo root):
 *   NODE_OPTIONS='--conditions=react-server' npm run debug:patient-referral-parse -- /path/to/Auth.pdf
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

process.env.NODE_ENV ??= "development";

function guessMime(name: string): string {
  const l = name.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".png")) return "image/png";
  if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

async function printReport(path: string) {
  const buffer = readFileSync(path);
  const filename = basename(path);
  const mimeType = guessMime(filename);

  const { extractPatientReferralPdfText } = await import("../src/lib/crm/patient-referral/pdf-text-extract");
  const { runPatientReferralExtractPipeline } = await import("../src/lib/crm/patient-referral/extract-pipeline");

  console.log("\n===", filename, "===");
  console.log("bytes:", buffer.length, "mime:", mimeType);

  const direct = await extractPatientReferralPdfText(buffer);
  console.log("pdf extract method:", direct.method);
  console.log("direct text length:", direct.text.length);
  console.log("first 500 chars:\n", direct.text.slice(0, 500));

  const pipeline = await runPatientReferralExtractPipeline(buffer, filename, {
    mimeType,
    referralSourceType: "tango_dina",
  });

  console.log("pipeline ok:", pipeline.ok);
  console.log("extractedTextLength:", pipeline.extractedTextLength);
  console.log("quality:", pipeline.quality);
  console.log("statusHeadline:", pipeline.statusHeadline);
  console.log("parsed JSON:\n", JSON.stringify(pipeline.suggestions, null, 2));
}

async function main() {
  const paths = process.argv.slice(2).filter((a) => !a.startsWith("-"));
  if (paths.length === 0) {
    console.error(
      "Usage: NODE_OPTIONS='--conditions=react-server' npm run debug:patient-referral-parse -- <file.pdf> [...]"
    );
    process.exit(1);
  }
  for (const p of paths) {
    await printReport(p);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
