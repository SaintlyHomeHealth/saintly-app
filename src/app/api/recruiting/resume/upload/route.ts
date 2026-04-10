import { NextResponse } from "next/server";

import type { ParsedResumeSuggestions, ResumeParseQuality } from "@/lib/recruiting/resume-parse-types";
import { resumeParsedActivityBody, runResumeExtractPipeline } from "@/lib/recruiting/resume-extract-pipeline";
import {
  isResumeMimeAllowed,
  normalizeBaseMime,
  resumeFileMimeFromFile,
  RESUME_HARD_ERROR_CHOOSE_FILE,
  RESUME_HARD_ERROR_INVALID_FILE,
  RESUME_HARD_ERROR_TOO_LARGE,
  RESUME_SOFT_MANUAL_PARSE_PROFILE,
} from "@/lib/recruiting/resume-upload-mime";
import { RECRUITING_RESUMES_BUCKET } from "@/lib/recruiting/recruiting-resume-storage";
import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

/** PDF/DOC parsing uses Node Buffer + canvas + tesseract — not Edge. */
export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

function guessContentType(filename: string): string {
  const l = filename.toLowerCase();
  if (l.endsWith(".pdf")) return "application/pdf";
  if (l.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (l.endsWith(".doc")) return "application/msword";
  return "application/octet-stream";
}

export async function POST(req: Request) {
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

  const candidateIdRaw = formData.get("candidateId");
  const candidateId = typeof candidateIdRaw === "string" ? candidateIdRaw.trim() : "";
  const file = formData.get("file");

  if (!candidateId || !UUID_RE.test(candidateId)) {
    return NextResponse.json({ error: "Invalid candidate" }, { status: 400 });
  }

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
  if (!isResumeMimeAllowed(mime, originalName)) {
    return NextResponse.json({ error: RESUME_HARD_ERROR_INVALID_FILE }, { status: 400 });
  }

  const safeName = sanitizeOriginalName(originalName);
  const timestamp = Date.now();
  const storagePath = `${candidateId}/${timestamp}-${safeName}`;

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .select("id, resume_storage_path")
    .eq("id", candidateId)
    .maybeSingle();

  if (fetchErr || !existing?.id) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const oldPath =
    typeof existing.resume_storage_path === "string" && existing.resume_storage_path.trim()
      ? existing.resume_storage_path.trim()
      : null;
  const isReplace = Boolean(oldPath);

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const contentType = guessContentType(safeName);

  const { error: uploadErr } = await supabaseAdmin.storage
    .from(RECRUITING_RESUMES_BUCKET)
    .upload(storagePath, buffer, {
      contentType,
      upsert: false,
    });

  if (uploadErr) {
    console.warn("[recruiting] resume upload:", uploadErr.message);
    return NextResponse.json({ error: uploadErr.message || "Upload failed" }, { status: 500 });
  }

  const uploadedAt = new Date().toISOString();

  const { error: updErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .update({
      resume_file_name: safeName,
      resume_storage_path: storagePath,
      resume_uploaded_at: uploadedAt,
    })
    .eq("id", candidateId);

  if (updErr) {
    await supabaseAdmin.storage.from(RECRUITING_RESUMES_BUCKET).remove([storagePath]);
    console.warn("[recruiting] resume DB update:", updErr.message);
    return NextResponse.json({ error: "Could not save resume metadata" }, { status: 500 });
  }

  if (oldPath && oldPath !== storagePath) {
    const { error: rmErr } = await supabaseAdmin.storage.from(RECRUITING_RESUMES_BUCKET).remove([oldPath]);
    if (rmErr) {
      console.warn("[recruiting] resume old file remove:", rmErr.message);
    }
  }

  const user = await getAuthenticatedUser();
  const bodyText = isReplace
    ? `Replaced resume with: ${safeName}`
    : `Uploaded resume: ${safeName}`;

  const { error: actErr } = await supabaseAdmin.from("recruiting_candidate_activities").insert({
    candidate_id: candidateId,
    activity_type: isReplace ? "resume_replaced" : "resume_uploaded",
    outcome: null,
    body: bodyText,
    created_by: user?.id ?? null,
  });

  if (actErr) {
    console.warn("[recruiting] resume activity:", actErr.message);
  }

  let parseOut: {
    ok: boolean;
    suggestions: ParsedResumeSuggestions | null;
    warning?: string;
    messages?: string[];
    quality?: ResumeParseQuality;
    statusHeadline?: string;
  } = { ok: false, suggestions: null };

  let parsedActivityBody = resumeParsedActivityBody("manual");

  try {
    const pipeline = await runResumeExtractPipeline(buffer, safeName, {
      mimeType: normalizeBaseMime(mime),
    });
    parsedActivityBody = resumeParsedActivityBody(pipeline.quality);
    parseOut = {
      ok: pipeline.quality !== "manual",
      suggestions: pipeline.suggestions,
      messages: pipeline.messages,
      quality: pipeline.quality,
      statusHeadline: pipeline.statusHeadline,
      warning: pipeline.messages.join("\n"),
    };
  } catch (e) {
    parsedActivityBody = resumeParsedActivityBody("manual");
    parseOut = {
      ok: false,
      quality: "manual",
      suggestions: null,
      warning: e instanceof Error ? e.message : "Parsing failed",
      messages: [RESUME_SOFT_MANUAL_PARSE_PROFILE],
    };
  }

  const { error: parseActErr } = await supabaseAdmin.from("recruiting_candidate_activities").insert({
    candidate_id: candidateId,
    activity_type: "resume_parsed",
    outcome: null,
    body: parsedActivityBody,
    created_by: user?.id ?? null,
  });

  if (parseActErr) {
    console.warn("[recruiting] resume_parsed activity:", parseActErr.message);
  }

  return NextResponse.json({
    ok: true,
    resume_file_name: safeName,
    resume_storage_path: storagePath,
    resume_uploaded_at: uploadedAt,
    parse: parseOut,
  });
}
