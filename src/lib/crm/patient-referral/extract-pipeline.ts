import "server-only";

import { PDFParse } from "pdf-parse";

import { isOcrSpaceRecruitingConfigured, ocrSpaceFromBuffer } from "@/lib/recruiting/ocr-space";
import { ocrPdfBuffer } from "@/lib/recruiting/resume-pdf-ocr";
import { canRunResumePdfOcr } from "@/lib/recruiting/recruiting-ocr-env";
import { extractResumeText } from "@/lib/recruiting/resume-text-extract";

import { parsePatientReferralText } from "./parse-heuristics";
import type {
  PatientReferralExtractionMethod,
  PatientReferralParsePayload,
  PatientReferralParseQuality,
} from "./types";
import {
  isPatientReferralImageFilename,
  isPatientReferralPdfFilename,
  PATIENT_REFERRAL_SOFT_MANUAL_PARSE,
} from "./upload-mime";

const MIN_USABLE_TEXT = 20;
const OCR_SHORT_DIRECT = 45;

async function extractImageTextViaOcr(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  if (isOcrSpaceRecruitingConfigured()) {
    const r = await ocrSpaceFromBuffer(buffer, filename, mimeType);
    return r.text.trim();
  }
  return "";
}

export async function runPatientReferralExtractPipeline(
  buffer: Buffer,
  filename: string,
  options?: { mimeType?: string; referralSourceType?: string | null }
): Promise<PatientReferralParsePayload & { textPreview?: string }> {
  const mimeType = options?.mimeType;
  let text = "";
  let directLen = 0;
  let ocrLen = 0;
  let ocrAttempted = false;
  const messages: string[] = [];
  const parseNotes: string[] = [];

  if (isPatientReferralPdfFilename(filename, mimeType)) {
    const direct = await extractResumeText(buffer, filename);
    text = (direct.text ?? "").trim();
    directLen = text.length;
    if (direct.error) parseNotes.push(`PDF text extraction: ${direct.error}`);

    if (directLen < OCR_SHORT_DIRECT && canRunResumePdfOcr()) {
      ocrAttempted = true;
      const ocr = await ocrPdfBuffer(buffer, { maxPages: 3 });
      const ocrText = (ocr.text ?? "").trim();
      ocrLen = ocrText.length;
      if (ocrText.length > text.length) text = ocrText;
    } else if (directLen < OCR_SHORT_DIRECT && isOcrSpaceRecruitingConfigured()) {
      ocrAttempted = true;
      const ocr = await ocrSpaceFromBuffer(buffer, filename, mimeType);
      ocrLen = ocr.text.trim().length;
      if (ocr.text.trim().length > text.length) text = ocr.text.trim();
      if (ocr.error) parseNotes.push(ocr.error);
    }
  } else if (isPatientReferralImageFilename(filename, mimeType)) {
    ocrAttempted = true;
    text = await extractImageTextViaOcr(buffer, filename, mimeType ?? "image/jpeg");
    ocrLen = text.length;
    if (!text) messages.push("OCR could not read this image. Enter details manually.");
  } else if (filename.toLowerCase().endsWith(".pdf")) {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      text = (result.text ?? "").trim();
      directLen = text.length;
    } finally {
      await parser.destroy();
    }
  }

  let extractionMethod: PatientReferralExtractionMethod = "manual";
  if (directLen >= MIN_USABLE_TEXT && ocrLen >= MIN_USABLE_TEXT) extractionMethod = "hybrid";
  else if (ocrLen >= MIN_USABLE_TEXT) extractionMethod = "ocr";
  else if (directLen >= MIN_USABLE_TEXT) extractionMethod = "pdf_text";

  const parsed = await parsePatientReferralText(text, {
    referralSourceType: options?.referralSourceType ?? null,
    useAi: true,
  });

  parseNotes.push(...parsed.parseNotes);

  let quality: PatientReferralParseQuality = "manual";
  let ok = false;
  let needsReview = true;

  if (parsed.isTangoDocument && parsed.suggestions) {
    quality = "tango_parsed";
    ok = true;
    extractionMethod = "tango";
    needsReview = parsed.confidenceWarnings.length > 0;
  } else if (parsed.suggestions && parsed.confidenceWarnings.length === 0) {
    quality = ocrAttempted && ocrLen >= MIN_USABLE_TEXT ? "ocr_success" : "parsed_ok";
    ok = true;
    needsReview = false;
  } else if (parsed.suggestions) {
    quality = ocrAttempted ? "ocr_limited" : "limited_parse";
    ok = true;
    needsReview = true;
  } else if (text.length >= MIN_USABLE_TEXT) {
    quality = "needs_review";
    messages.push(PATIENT_REFERRAL_SOFT_MANUAL_PARSE);
  } else {
    quality = "manual";
    messages.push(PATIENT_REFERRAL_SOFT_MANUAL_PARSE);
  }

  if (parsed.confidenceWarnings.length) {
    messages.push(...parsed.confidenceWarnings);
  }

  return {
    ok,
    quality,
    suggestions: parsed.suggestions,
    messages: messages.length ? messages : [PATIENT_REFERRAL_SOFT_MANUAL_PARSE],
    extractionMethod,
    confidenceWarnings: parsed.confidenceWarnings,
    parseNotes,
    needsReview,
    isTangoDocument: parsed.isTangoDocument,
    documentType: parsed.suggestions?.document_type ?? null,
    textPreview: text.slice(0, 500),
    statusHeadline: ok
      ? needsReview
        ? "Document parsed — review suggested fields"
        : "Document parsed successfully"
      : "Could not auto-read enough text — continue manually",
  };
}
