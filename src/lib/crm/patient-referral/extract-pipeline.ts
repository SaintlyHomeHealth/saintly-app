import "server-only";

import { isOcrSpaceRecruitingConfigured, ocrSpaceFromBuffer } from "@/lib/recruiting/ocr-space";
import { ocrPdfBuffer } from "@/lib/recruiting/resume-pdf-ocr";
import { canRunResumePdfOcr } from "@/lib/recruiting/recruiting-ocr-env";

import { parsePatientReferralText } from "./parse-heuristics";
import { extractPatientReferralPdfText } from "./pdf-text-extract";
import { hasMeaningfulParseData } from "./queue-summary";
import type {
  PatientReferralExtractionMethod,
  PatientReferralParseDebug,
  PatientReferralParsePayload,
  PatientReferralParseQuality,
} from "./types";
import {
  isPatientReferralImageFilename,
  isPatientReferralPdfFilename,
} from "./upload-mime";

const MIN_PDF_TEXT = 50;
const OCR_SHORT_DIRECT = 200;

const PDF_EMPTY_ERROR = "PDF text extraction returned empty text";
const PDF_NOT_RECEIVED_ERROR = "Uploaded file did not reach server as a valid PDF";

function bufferStartsWithPdf(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.toString("utf8", 0, 4) === "%PDF";
}

function first20BytesHex(buffer: Buffer): string {
  return buffer.subarray(0, 20).toString("hex");
}

async function extractImageTextViaOcr(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
  if (isOcrSpaceRecruitingConfigured()) {
    const r = await ocrSpaceFromBuffer(buffer, filename, mimeType);
    return r.text.trim();
  }
  return "";
}

function countParsedFields(suggestions: PatientReferralParsePayload["suggestions"]): number {
  if (!suggestions) return 0;
  return Object.values(suggestions).filter((v) => v != null && v !== "" && !(Array.isArray(v) && v.length === 0)).length;
}

export async function runPatientReferralExtractPipeline(
  buffer: Buffer,
  filename: string,
  options?: { mimeType?: string; referralSourceType?: string | null }
): Promise<PatientReferralParsePayload & { textPreview?: string; extractedTextLength?: number; parseDebug?: PatientReferralParseDebug }> {
  const mimeType = options?.mimeType;
  let text = "";
  let directLen = 0;
  let ocrLen = 0;
  let ocrAttempted = false;
  let pdfExtractMethod: string | null = null;
  let pdfParseTextLength = 0;
  let pdfjsTextLength = 0;
  let pdfParseError: string | null = null;
  let pdfjsError: string | null = null;
  const messages: string[] = [];
  const parseNotes: string[] = [];
  const isPdf = isPatientReferralPdfFilename(filename, mimeType);
  const startsWithPdf = bufferStartsWithPdf(buffer);
  const runtime = `node ${process.version}`;

  // Prove the bytes actually arrived as a PDF before blaming text extraction.
  if (isPdf && (buffer.length <= 0 || !startsWithPdf)) {
    const debug: PatientReferralParseDebug = {
      fileName: filename,
      fileSize: buffer.length,
      mimeType: mimeType ?? null,
      extractedTextLength: 0,
      textPreview: "",
      documentTypeDetected: null,
      parsedFieldsCount: 0,
      pdfExtractMethod: null,
      error: PDF_NOT_RECEIVED_ERROR,
      startsWithPdf,
      bufferLength: buffer.length,
      first20Bytes: first20BytesHex(buffer),
      runtime,
    };
    if (process.env.PATIENT_REFERRAL_PARSE_DEBUG === "1" || process.env.NODE_ENV === "development") {
      console.info("[patient-referral] parse debug", JSON.stringify(debug));
    }
    return {
      ok: false,
      quality: "manual",
      suggestions: null,
      messages: [PDF_NOT_RECEIVED_ERROR],
      extractionMethod: "manual",
      confidenceWarnings: [],
      parseNotes,
      needsReview: false,
      isTangoDocument: false,
      documentType: null,
      textPreview: "",
      extractedTextLength: 0,
      parseDebug: debug,
      statusHeadline: PDF_NOT_RECEIVED_ERROR,
    };
  }

  if (isPdf) {
    const direct = await extractPatientReferralPdfText(buffer);
    text = (direct.text ?? "").trim();
    directLen = text.length;
    pdfExtractMethod = direct.method;
    pdfParseTextLength = direct.pdfParseTextLength;
    pdfjsTextLength = direct.pdfjsTextLength;
    pdfParseError = direct.pdfParseError ?? null;
    pdfjsError = direct.pdfjsError ?? null;
    if (direct.error) parseNotes.push(`PDF text extraction: ${direct.error}`);

    if (directLen < OCR_SHORT_DIRECT && canRunResumePdfOcr()) {
      ocrAttempted = true;
      const ocr = await ocrPdfBuffer(buffer, { maxPages: 3 });
      const ocrText = (ocr.text ?? "").trim();
      ocrLen = ocrText.length;
      if (ocrText.length > text.length) text = ocrText;
    } else if (directLen < OCR_SHORT_DIRECT && isOcrSpaceRecruitingConfigured()) {
      ocrAttempted = true;
      const ocr = await ocrSpaceFromBuffer(buffer, filename, mimeType ?? "application/pdf");
      ocrLen = ocr.text.trim().length;
      if (ocr.text.trim().length > text.length) text = ocr.text.trim();
      if (ocr.error) parseNotes.push(ocr.error);
    }
  } else if (isPatientReferralImageFilename(filename, mimeType)) {
    ocrAttempted = true;
    text = await extractImageTextViaOcr(buffer, filename, mimeType ?? "image/jpeg");
    ocrLen = text.length;
    if (!text) messages.push("OCR could not read this image. Enter details manually.");
  }

  const extractedTextLength = text.length;

  if (isPdf && extractedTextLength < MIN_PDF_TEXT) {
    const debug: PatientReferralParseDebug = {
      fileName: filename,
      fileSize: buffer.length,
      mimeType: mimeType ?? null,
      extractedTextLength,
      textPreview: text.slice(0, 1000),
      documentTypeDetected: null,
      parsedFieldsCount: 0,
      pdfExtractMethod,
      error: PDF_EMPTY_ERROR,
      startsWithPdf,
      bufferLength: buffer.length,
      first20Bytes: first20BytesHex(buffer),
      runtime,
      pdfParseTextLength,
      pdfjsTextLength,
      pdfParseError,
      pdfjsError,
      ocrAttempted,
      ocrTextLength: ocrLen,
    };

    if (process.env.PATIENT_REFERRAL_PARSE_DEBUG === "1" || process.env.NODE_ENV === "development") {
      console.info("[patient-referral] parse debug", JSON.stringify(debug));
    }

    return {
      ok: false,
      quality: "manual",
      suggestions: null,
      messages: [PDF_EMPTY_ERROR],
      extractionMethod: "manual",
      confidenceWarnings: [],
      parseNotes,
      needsReview: false,
      isTangoDocument: false,
      documentType: null,
      textPreview: text.slice(0, 500),
      extractedTextLength,
      parseDebug: debug,
      statusHeadline: PDF_EMPTY_ERROR,
    };
  }

  let extractionMethod: PatientReferralExtractionMethod = "manual";
  if (directLen >= MIN_PDF_TEXT && ocrLen >= MIN_PDF_TEXT) extractionMethod = "hybrid";
  else if (ocrLen >= MIN_PDF_TEXT) extractionMethod = "ocr";
  else if (directLen >= MIN_PDF_TEXT) extractionMethod = "pdf_text";

  const parsed = await parsePatientReferralText(text, {
    referralSourceType: options?.referralSourceType ?? null,
    useAi: true,
  });

  parseNotes.push(...parsed.parseNotes);

  const meaningful = hasMeaningfulParseData(parsed.suggestions);
  let quality: PatientReferralParseQuality = "manual";
  let ok = false;
  let needsReview = true;

  if (meaningful) {
    ok = true;
    if (parsed.isTangoDocument && parsed.suggestions) {
      quality = "tango_parsed";
      extractionMethod = "tango";
      needsReview = parsed.confidenceWarnings.length > 0;
    } else if (parsed.confidenceWarnings.length === 0) {
      quality = ocrAttempted && ocrLen >= MIN_PDF_TEXT ? "ocr_success" : "parsed_ok";
      needsReview = false;
    } else {
      quality = ocrAttempted ? "ocr_limited" : "limited_parse";
      needsReview = true;
    }
  } else if (extractedTextLength >= MIN_PDF_TEXT) {
    quality = "needs_review";
    messages.push("Could not extract patient fields from document text.");
  } else {
    quality = "manual";
    messages.push(isPdf ? PDF_EMPTY_ERROR : "Could not read enough text from this document.");
  }

  if (parsed.confidenceWarnings.length && meaningful) {
    messages.push(...parsed.confidenceWarnings);
  }

  const parseDebug: PatientReferralParseDebug = {
    fileName: filename,
    fileSize: buffer.length,
    mimeType: mimeType ?? null,
    extractedTextLength,
    textPreview: text.slice(0, 1000),
    documentTypeDetected: parsed.suggestions?.document_type ?? null,
    parsedFieldsCount: countParsedFields(parsed.suggestions),
    pdfExtractMethod,
    error: ok ? null : messages[0] ?? null,
    startsWithPdf,
    bufferLength: buffer.length,
    first20Bytes: first20BytesHex(buffer),
    runtime,
    pdfParseTextLength,
    pdfjsTextLength,
    pdfParseError,
    pdfjsError,
    ocrAttempted,
    ocrTextLength: ocrLen,
  };

  if (process.env.PATIENT_REFERRAL_PARSE_DEBUG === "1" || process.env.NODE_ENV === "development") {
    console.info("[patient-referral] parse debug", JSON.stringify({
      ...parseDebug,
      parserResult: parsed.suggestions,
    }));
  }

  return {
    ok,
    quality,
    suggestions: meaningful ? parsed.suggestions : null,
    messages: messages.length ? messages : ok ? ["Document parsed successfully"] : [PDF_EMPTY_ERROR],
    extractionMethod,
    confidenceWarnings: parsed.confidenceWarnings,
    parseNotes,
    needsReview: ok ? needsReview : false,
    isTangoDocument: parsed.isTangoDocument,
    documentType: parsed.suggestions?.document_type ?? null,
    textPreview: text.slice(0, 500),
    extractedTextLength,
    parseDebug,
    statusHeadline: ok
      ? needsReview
        ? "Document parsed — review suggested fields"
        : "Document parsed successfully"
      : messages[0] ?? PDF_EMPTY_ERROR,
  };
}
