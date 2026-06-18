import { NextResponse } from "next/server";

import type { ParsedResumeSuggestions, ResumeExtractionMethod, ResumeParseQuality } from "@/lib/recruiting/resume-parse-types";
import { resumeParsedActivityBody, runResumeExtractPipeline } from "@/lib/recruiting/resume-extract-pipeline";
import { persistResumeParseCache } from "@/lib/recruiting/resume-parse-persist";
import { RECRUITING_RESUMES_BUCKET } from "@/lib/recruiting/recruiting-resume-storage";
import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

  let body: { candidateId?: string };
  try {
    body = (await req.json()) as { candidateId?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const candidateId = typeof body.candidateId === "string" ? body.candidateId.trim() : "";
  if (!candidateId || !UUID_RE.test(candidateId)) {
    return NextResponse.json({ error: "Invalid candidate" }, { status: 400 });
  }

  const { data: row, error: loadErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .select("id, resume_storage_path, resume_file_name")
    .eq("id", candidateId)
    .maybeSingle();

  if (loadErr || !row?.id) {
    return NextResponse.json({ error: "Candidate not found" }, { status: 404 });
  }

  const storagePath =
    typeof row.resume_storage_path === "string" ? row.resume_storage_path.trim() : "";
  if (!storagePath) {
    return NextResponse.json({ error: "No resume on file" }, { status: 400 });
  }

  const { data: blob, error: dlErr } = await supabaseAdmin.storage
    .from(RECRUITING_RESUMES_BUCKET)
    .download(storagePath);

  if (dlErr || !blob) {
    return NextResponse.json({ error: dlErr?.message || "Could not download resume" }, { status: 500 });
  }

  const safeName =
    typeof row.resume_file_name === "string" && row.resume_file_name.trim()
      ? row.resume_file_name.trim()
      : "resume.pdf";
  const buffer = Buffer.from(await blob.arrayBuffer());
  const mimeType = guessContentType(safeName);

  let pipeline: Awaited<ReturnType<typeof runResumeExtractPipeline>>;
  try {
    pipeline = await runResumeExtractPipeline(buffer, safeName, { mimeType });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Re-parse failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  await persistResumeParseCache(supabaseAdmin, candidateId, pipeline);

  const user = await getAuthenticatedUser();
  await supabaseAdmin.from("recruiting_candidate_activities").insert({
    candidate_id: candidateId,
    activity_type: "resume_parsed",
    outcome: null,
    body: resumeParsedActivityBody(pipeline.quality),
    created_by: user?.id ?? null,
  });

  const parseOut: {
    ok: boolean;
    suggestions: ParsedResumeSuggestions | null;
    warning?: string;
    messages?: string[];
    quality?: ResumeParseQuality;
    statusHeadline?: string;
    extractionMethod?: ResumeExtractionMethod;
    confidenceWarnings?: string[];
    parseNotes?: string[];
    textPreview?: string;
    needsReview?: boolean;
  } = {
    ok: pipeline.quality !== "manual",
    suggestions: pipeline.suggestions,
    messages: pipeline.messages,
    quality: pipeline.quality,
    statusHeadline: pipeline.statusHeadline,
    warning: pipeline.messages.join("\n"),
    extractionMethod: pipeline.extractionMethod,
    confidenceWarnings: pipeline.confidenceWarnings,
    parseNotes: pipeline.parseNotes,
    textPreview: pipeline.textPreview,
    needsReview: pipeline.needsReview,
  };

  return NextResponse.json({ ok: true, parse: parseOut });
}
