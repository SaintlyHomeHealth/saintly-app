import { NextResponse } from "next/server";

import type { ParsedResumeSuggestions, ResumeParseQuality } from "@/lib/recruiting/resume-parse-types";
import {
  normalizeBaseMime,
  isResumeMimeAllowed,
  resumeFileMimeFromFile,
  RESUME_HARD_ERROR_CHOOSE_FILE,
  RESUME_HARD_ERROR_INVALID_FILE,
  RESUME_HARD_ERROR_TOO_LARGE,
  RESUME_SOFT_MANUAL_PARSE_CREATE,
} from "@/lib/recruiting/resume-upload-mime";
import { runResumeExtractPipeline } from "@/lib/recruiting/resume-extract-pipeline";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

/** PDF/DOC parsing uses Node Buffer + native deps — avoid Edge runtime. */
export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = [".pdf", ".doc", ".docx"] as const;

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

function sanitizeOriginalName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "resume";
  const cleaned = base.replace(/[^a-zA-Z0-9._\- ]/g, "_").trim();
  return cleaned.slice(0, 180) || "resume";
}

export type ParseOnlyParsePayload = {
  ok: boolean;
  quality: ResumeParseQuality;
  suggestions: ParsedResumeSuggestions | null;
  messages: string[];
  /** Overrides default banner title when present (e.g. scanned PDF without server-side OCR) */
  statusHeadline?: string;
  /** @deprecated prefer messages */
  warning?: string;
};

const RECOVERABLE_MANUAL: ParseOnlyParsePayload = {
  ok: false,
  quality: "manual",
  suggestions: null,
  messages: [RESUME_SOFT_MANUAL_PARSE_CREATE],
};

function logParseOnly(label: string, payload: Record<string, unknown>) {
  if (process.env.RECRUITING_RESUME_PARSE_DEBUG === "1" || process.env.NODE_ENV === "development") {
    console.log(`[parse-only] ${label}`, payload);
  }
}

/** Structured metrics for every parse (no resume text — safe for production logs). */
function logParseOnlyProductionMetrics(payload: Record<string, unknown>) {
  console.log(JSON.stringify({ source: "parse-only/metrics", ...payload }));
}

export async function POST(req: Request) {
  logParseOnly("entered", {});

  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: RESUME_HARD_ERROR_CHOOSE_FILE }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: RESUME_HARD_ERROR_TOO_LARGE }, { status: 400 });
  }

  const originalName = file.name || "resume";
  if (!hasAllowedExtension(originalName)) {
    return NextResponse.json({ error: RESUME_HARD_ERROR_INVALID_FILE }, { status: 400 });
  }

  const mime = resumeFileMimeFromFile(file);
  const baseMime = normalizeBaseMime(mime);
  logParseOnly("file", { mime: baseMime, size: file.size, name: originalName });

  if (!isResumeMimeAllowed(mime, originalName)) {
    return NextResponse.json({ error: RESUME_HARD_ERROR_INVALID_FILE }, { status: 400 });
  }

  const safeName = sanitizeOriginalName(originalName);

  let parseOut: ParseOnlyParsePayload;
  let pipeline: Awaited<ReturnType<typeof runResumeExtractPipeline>> | undefined;

  const hardDebug =
    process.env.NODE_ENV === "development" || process.env.RECRUITING_RESUME_PARSE_DEBUG === "1";

  try {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    pipeline = await runResumeExtractPipeline(buffer, safeName, {
      mimeType: baseMime,
      includeDebug: hardDebug,
      includeDebugSummaryAlways: true,
    });
    const ok = pipeline.quality !== "manual";
    parseOut = {
      ok,
      quality: pipeline.quality,
      suggestions: pipeline.suggestions,
      messages: pipeline.messages,
      statusHeadline: pipeline.statusHeadline,
      warning: pipeline.messages.join("\n"),
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    logParseOnly("recoverable_catch", { message: msg, stack });
    console.error("[parse-only] unexpected error after validation — returning manual parse", e);
    parseOut = {
      ...RECOVERABLE_MANUAL,
      warning: msg,
    };
  }

  logParseOnly("response", { quality: parseOut.quality, parseOk: parseOut.ok });

  if (pipeline?.debug) {
    const d = pipeline.debug;
    logParseOnlyProductionMetrics({
      resume_file_name: safeName,
      mimeType: baseMime,
      directTextLen: d.directTextLen,
      ocrAttempted: d.ocrAttempted,
      ocrSpaceAttempted: d.ocrSpaceAttempted,
      ocrSpaceSkippedLimits: d.ocrSpaceSkippedLimits,
      ocrSpaceTextLen: d.ocrSpaceTextLen,
      ocrRuntimeAvailable: d.ocrRuntimeAvailable,
      canvasRuntimeLoaded: d.canvasRuntimeLoaded,
      canvasRuntimeError: d.canvasRuntimeError ?? null,
      pagesRendered: d.pagesRenderedForOcr,
      ocrRawTextLen: d.ocrRawTextLen,
      quality: pipeline.quality,
      failureStep: d.failureStep,
    });
  }

  const hardDebugPayload =
    hardDebug && pipeline?.debug
      ? {
          filename: pipeline.debug.filename,
          mimeType: pipeline.debug.mimeType,
          directTextLen: pipeline.debug.directTextLen,
          directTextPreview: pipeline.debug.directTextPreview,
          ocrAttempted: pipeline.debug.ocrAttempted,
          ocrSpaceAttempted: pipeline.debug.ocrSpaceAttempted,
          ocrSpaceSkippedLimits: pipeline.debug.ocrSpaceSkippedLimits,
          ocrSpaceTextLen: pipeline.debug.ocrSpaceTextLen,
          ocrSource: pipeline.debug.ocrSource,
          ocrRuntimeAvailable: pipeline.debug.ocrRuntimeAvailable,
          canvasRuntimeLoaded: pipeline.debug.canvasRuntimeLoaded,
          canvasRuntimeError: pipeline.debug.canvasRuntimeError,
          pagesRendered: pipeline.debug.pagesRenderedForOcr,
          ocrRawTextLen: pipeline.debug.ocrRawTextLen,
          ocrTextPreview: pipeline.debug.ocrTextPreview,
          finalParseInputLen: pipeline.debug.parseHeuristicsInputLen,
          finalParsePreview: pipeline.debug.finalParsePreview,
          suggestions: pipeline.suggestions,
          quality: pipeline.quality,
          failureStep: pipeline.debug.failureStep,
        }
      : undefined;

  return NextResponse.json({
    ok: true,
    resume_file_name: safeName,
    parse: parseOut,
    ...(hardDebugPayload ? { hardDebug: hardDebugPayload } : {}),
  });
}
