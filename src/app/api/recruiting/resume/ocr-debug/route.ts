import { NextResponse } from "next/server";

import { isResumeOcrDebugEndpointEnabled } from "@/lib/recruiting/resume-extract-debug";
import { evaluateResumeOcrSanity } from "@/lib/recruiting/resume-ocr-sanity";
import {
  normalizeBaseMime,
  isResumeMimeAllowed,
  resumeFileMimeFromFile,
  RESUME_HARD_ERROR_CHOOSE_FILE,
  RESUME_HARD_ERROR_INVALID_FILE,
  RESUME_HARD_ERROR_TOO_LARGE,
} from "@/lib/recruiting/resume-upload-mime";
import { runResumeExtractPipeline } from "@/lib/recruiting/resume-extract-pipeline";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

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

/**
 * Dev / RECRUITING_RESUME_PARSE_DEBUG-only: full OCR + pipeline debug JSON for a resume upload.
 * Does not persist files. Manager+ only.
 */
export async function POST(req: Request) {
  if (!isResumeOcrDebugEndpointEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: { get: (name: string) => FormDataEntryValue | null };
  try {
    formData = (await req.formData()) as unknown as { get: (name: string) => FormDataEntryValue | null };
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
  if (!isResumeMimeAllowed(mime, originalName)) {
    return NextResponse.json({ error: RESUME_HARD_ERROR_INVALID_FILE }, { status: 400 });
  }

  const safeName = sanitizeOriginalName(originalName);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const url = new URL(req.url);
  const forceOcrPage1 = url.searchParams.get("forceOcrPage1") === "1";

  const pipeline = await runResumeExtractPipeline(buffer, safeName, {
    mimeType: baseMime,
    includeDebug: true,
    ...(forceOcrPage1 ? { forceOcrPage1Debug: true } : {}),
  });

  let page1Sanity: { matched: string[]; missing: string[] } | null = null;
  if (safeName.toLowerCase().endsWith(".pdf")) {
    const p1 = (pipeline.ocrPage1RawText ?? pipeline.debug?.ocrPage1RawText ?? "").trim();
    page1Sanity = evaluateResumeOcrSanity(p1);
  }

  return NextResponse.json({
    ok: true,
    resume_file_name: safeName,
    mime: baseMime,
    parse: {
      quality: pipeline.quality,
      suggestions: pipeline.suggestions,
      messages: pipeline.messages,
    },
    debug: pipeline.debug ?? null,
    ocrPage1Sanity: page1Sanity,
  });
}
