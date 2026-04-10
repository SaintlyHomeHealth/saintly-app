/**
 * End-to-end resume extract + OCR (page 1) + parse — prints real metrics for debugging.
 *
 * Usage (from repo root):
 *   NODE_OPTIONS='--conditions=react-server' npx tsx scripts/debug-resume-extract.ts /path/to/a.pdf /path/to/b.pdf
 *
 * Optional: RECRUITING_RESUME_FORCE_OCR_PAGE1_DEBUG=1 matches the env-based server behavior.
 */

import { readFileSync } from "node:fs";
import { basename } from "node:path";

process.env.NODE_ENV ??= "development";

function guessMime(name: string): string {
  const l = name.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (l.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

async function main() {
  const args = process.argv.slice(2);
  const paths = args.filter((a) => !a.startsWith("-"));

  const { extractResumeText } = await import("../src/lib/recruiting/resume-text-extract.ts");
  const { runResumeExtractPipeline } = await import("../src/lib/recruiting/resume-extract-pipeline.ts");

  if (args.includes("--fixture")) {
    const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
    const doc = await PDFDocument.create();
    const page = doc.addPage([612, 792]);
    const font = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText("Jane Q Doe", { x: 72, y: 720, size: 14, font, color: rgb(0.1, 0.1, 0.15) });
    page.drawText("Registered Nurse (RN, BSN)", { x: 72, y: 698, size: 11, font, color: rgb(0.1, 0.1, 0.15) });
    page.drawText("jane.doe@example.com", { x: 72, y: 676, size: 11, font, color: rgb(0.1, 0.1, 0.15) });
    page.drawText("(480) 555-0100", { x: 72, y: 654, size: 11, font, color: rgb(0.1, 0.1, 0.15) });
    const buf = Buffer.from(await doc.save());
    await printReport("fixture-inline.pdf", "application/pdf", buf, extractResumeText, runResumeExtractPipeline);
    return;
  }

  if (paths.length === 0) {
    console.error(
      "Usage: NODE_OPTIONS='--conditions=react-server' npx tsx scripts/debug-resume-extract.ts <file.pdf|doc|docx> [...]\n" +
        "   or: ... --fixture   (generates a tiny text PDF in memory)\n"
    );
    process.exit(1);
  }

  for (const filePath of paths) {
    const filename = basename(filePath);
    const mime = guessMime(filename);
    const buffer = readFileSync(filePath);
    await printReport(filename, mime, buffer, extractResumeText, runResumeExtractPipeline);
  }
}

async function printReport(
  filename: string,
  mime: string,
  buffer: Buffer,
  extractResumeText: typeof import("../src/lib/recruiting/resume-text-extract.ts").extractResumeText,
  runResumeExtractPipeline: typeof import("../src/lib/recruiting/resume-extract-pipeline.ts").runResumeExtractPipeline
) {
  const direct = await extractResumeText(buffer, filename);
  const directText = (direct.text ?? "").trim();

  const pipeline = await runResumeExtractPipeline(buffer, filename, {
    mimeType: mime,
    includeDebug: true,
    forceOcrPage1Debug: true,
  });

  const ocrAttempted = pipeline.debug?.ocrAttempted ?? false;
  const ocrText = pipeline.ocrPage1RawText ?? pipeline.debug?.ocrPage1RawText ?? "";
  const ocrLen = ocrText.trim().length;
  const parseInputSample = pipeline.debug?.parseInputFirst500 ?? "";
  const parseLen = pipeline.debug?.parseHeuristicsInputLen ?? pipeline.text.length;

  console.log("\n==========", filename, "==========");
  console.log(JSON.stringify({ mimeType: mime }, null, 0));
  console.log("directTextLen:", directText.length);
  console.log("directFirst500:\n", directText.slice(0, 500));
  console.log("ocrAttempted:", ocrAttempted);
  console.log("ocrTextLen:", ocrLen);
  console.log("ocrFirst500:\n", ocrText.slice(0, 500));
  console.log("finalParseInputLen:", parseLen);
  console.log("parseInputFirst500:\n", parseInputSample);
  console.log("finalParsedSuggestions:", JSON.stringify(pipeline.suggestions, null, 2));
  console.log("quality:", pipeline.quality);
  console.log("failureStep:", pipeline.debug?.failureStep);
  console.log("---");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
