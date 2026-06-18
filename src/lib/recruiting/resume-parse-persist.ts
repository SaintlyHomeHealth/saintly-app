import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { ResumeExtractPipelineResult } from "@/lib/recruiting/resume-extract-pipeline";

const MAX_TEXT_COL = 80_000;

function clip(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  return t.slice(0, MAX_TEXT_COL);
}

/** Persist cached extraction/parse metadata — never throws. */
export async function persistResumeParseCache(
  supabase: SupabaseClient,
  candidateId: string,
  pipeline: ResumeExtractPipelineResult
): Promise<void> {
  const id = candidateId.trim();
  if (!id) return;

  const patch: Record<string, unknown> = {
    resume_extracted_raw_text: clip(pipeline.rawText ?? ""),
    resume_extracted_clean_text: clip(pipeline.cleanedText ?? ""),
    resume_extraction_method: pipeline.extractionMethod ?? "manual",
    resume_parse_quality: pipeline.quality,
    resume_parse_warnings: pipeline.confidenceWarnings?.length
      ? pipeline.confidenceWarnings.join("\n")
      : null,
    resume_parse_notes: pipeline.parseNotes?.length ? pipeline.parseNotes.join("\n") : null,
  };

  const { error } = await supabase.from("recruiting_candidates").update(patch).eq("id", id);
  if (error) {
    console.warn("[recruiting] resume parse cache:", error.message);
  }
}
