import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { fetchCrmOpenAiJsonObject } from "@/lib/crm/openai-crm-task-json";
import { extractFaxDocumentText } from "@/lib/fax/fax-document-text";
import { saintlyCrmTaskExtractionModel } from "@/lib/crm/saintly-ai-voice-config";

/** Local constant — do not import from fax-service (avoids circular dependency). */
const FAX_DOCUMENTS_BUCKET = "fax-documents";

const NOTE_MAX_LEN = 200;
const MIN_TEXT_FOR_MODEL = 20;
const AI_BUDGET_MS = 45_000;

const SYSTEM_PROMPT = `You label inbound home-health faxes for a busy admin inbox.
Return JSON only: { "note": string }.

Rules for "note":
- 3 to 8 words, title-style, like a staff sticky note
- Prefer: patient last name (when clearly labeled Patient Name / Patient / Pt / Member / Client), document type, vendor/source
- Ignore cover-sheet "To:" / facility blocks — those are the sender, not the patient
- Do not use clinician or nurse names (e.g. Victoria McBerty, Tawnya Grover) as the patient
- Do not dump PHI (no full SSN, DOB, address, Medicare numbers)
- No full sentences or paragraphs
- If the document text is missing, return {"note":""} — never invent "empty fax" or "no PDF"`;

export type InboundFaxAiSummaryResult =
  | { ok: true; note: string }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

function isFaxAiSummaryEnabled(): boolean {
  return process.env.SAINTLY_FAX_AI_SUMMARY !== "0";
}

function faxAiSummaryModel(): string {
  return process.env.SAINTLY_FAX_AI_SUMMARY_MODEL?.trim() || saintlyCrmTaskExtractionModel();
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function isUnusableMissingPdfNote(note: string): boolean {
  return /empty fax|no pdf file|no pdf\b/i.test(note);
}

function normalizeAiNote(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!s) return null;
  if (isUnusableMissingPdfNote(s)) return null;
  return s.slice(0, NOTE_MAX_LEN);
}

export async function loadFaxPdfBytes(input: {
  storagePath: string | null;
  mediaUrl: string | null;
}): Promise<Buffer | null> {
  const srcPath =
    typeof input.storagePath === "string" && input.storagePath.trim() ? input.storagePath.trim() : null;
  if (srcPath) {
    const { data, error } = await supabaseAdmin.storage.from(FAX_DOCUMENTS_BUCKET).download(srcPath);
    if (!error && data) {
      const buf = Buffer.from(await data.arrayBuffer());
      if (buf.byteLength > 0) return buf;
    }
  }

  const media =
    typeof input.mediaUrl === "string" && input.mediaUrl.trim().startsWith("https://")
      ? input.mediaUrl.trim()
      : null;
  if (media) {
    try {
      const res = await fetch(media, { cache: "no-store" });
      if (!res.ok) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      return buf.byteLength > 0 ? buf : null;
    } catch {
      return null;
    }
  }

  return null;
}

async function generateNoteFromPages(modelText: string): Promise<string | null> {
  const json = await fetchCrmOpenAiJsonObject(
    faxAiSummaryModel(),
    SYSTEM_PROMPT,
    `Fax document text by page:\n\n${modelText}`
  );
  const rec = asRecord(json);
  return normalizeAiNote(rec?.note);
}

async function persistNoteIfEmpty(faxId: string, note: string): Promise<boolean> {
  const { data: current, error: readErr } = await supabaseAdmin
    .from("fax_messages")
    .select("id, note")
    .eq("id", faxId)
    .maybeSingle();
  if (readErr || !current?.id) {
    console.warn("[fax/ai-summary] persist_read_failed", {
      fax_id: faxId,
      error: readErr?.message,
    });
    return false;
  }
  if (typeof current.note === "string" && current.note.trim()) {
    return false;
  }

  const { data, error } = await supabaseAdmin
    .from("fax_messages")
    .update({ note })
    .eq("id", faxId)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[fax/ai-summary] persist_failed", { fax_id: faxId, error: error.message });
    return false;
  }
  return Boolean(data?.id);
}

/**
 * Generate a short staff-style note for an inbound fax PDF.
 * Only writes when `fax_messages.note` is still empty. Never throws (safe for webhooks).
 * Never writes a "no PDF" note onto a fax that has pages or stored media.
 */
export async function summarizeInboundFaxNote(faxId: string): Promise<InboundFaxAiSummaryResult> {
  const id = faxId.trim();
  if (!id) return { ok: false, skipped: true, reason: "missing_fax_id" };

  if (!isFaxAiSummaryEnabled()) {
    return { ok: false, skipped: true, reason: "disabled" };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, skipped: true, reason: "missing_openai_key" };
  }

  const { data: row, error } = await supabaseAdmin
    .from("fax_messages")
    .select("id, direction, status, note, storage_path, media_url, page_count")
    .eq("id", id)
    .maybeSingle();

  if (error || !row?.id) {
    return { ok: false, skipped: false, error: error?.message ?? "Fax not found" };
  }

  if (row.direction !== "inbound") {
    return { ok: false, skipped: true, reason: "not_inbound" };
  }

  if (String(row.status).toLowerCase() === "failed") {
    return { ok: false, skipped: true, reason: "failed_status" };
  }

  if (typeof row.note === "string" && row.note.trim()) {
    return { ok: false, skipped: true, reason: "note_already_set" };
  }

  const storagePath =
    typeof row.storage_path === "string" && row.storage_path.trim() ? row.storage_path.trim() : null;
  const mediaUrl = typeof row.media_url === "string" && row.media_url.trim() ? row.media_url.trim() : null;
  const pageCount = typeof row.page_count === "number" ? row.page_count : null;

  if (!storagePath && !mediaUrl) {
    return { ok: false, skipped: true, reason: pageCount && pageCount > 0 ? "media_missing" : "no_pdf" };
  }

  try {
    const buffer = await loadFaxPdfBytes({ storagePath, mediaUrl });
    if (!buffer) {
      return { ok: false, skipped: true, reason: pageCount && pageCount > 0 ? "media_missing" : "pdf_unavailable" };
    }

    const extracted = await extractFaxDocumentText(buffer, { faxId: id });
    if (extracted.totalChars < MIN_TEXT_FOR_MODEL) {
      console.warn("[fax/ai-summary] insufficient_text", {
        fax_id: id,
        text_len: extracted.totalChars,
        page_count: extracted.pageCount,
        ocr_pages: extracted.ocrPageCount,
      });
      return { ok: false, skipped: true, reason: "insufficient_text" };
    }

    const note = await generateNoteFromPages(extracted.modelText);
    if (!note) {
      return { ok: false, skipped: false, error: "Model returned empty note" };
    }

    const wrote = await persistNoteIfEmpty(id, note);
    if (!wrote) {
      return { ok: false, skipped: true, reason: "note_already_set_or_race" };
    }

    await supabaseAdmin.from("fax_events").insert({
      fax_message_id: id,
      event_type: "ai_note_generated",
      payload: {
        note,
        extract_method: "paged",
        text_len: extracted.totalChars,
        page_count: extracted.pageCount,
        ocr_pages: extracted.ocrPageCount,
        page_char_counts: extracted.pages.map((p) => ({ page: p.page, chars: p.charCount, method: p.method })),
      },
    });

    console.log("[fax/ai-summary] note_written", {
      fax_id: id,
      note,
      extract_method: "paged",
      text_len: extracted.totalChars,
      page_count: extracted.pageCount,
    });

    return { ok: true, note };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[fax/ai-summary] failed", { fax_id: id, error: msg });
    return { ok: false, skipped: false, error: msg };
  }
}

/**
 * Await summarization with a hard time budget so inbound webhooks stay reliable.
 */
export async function summarizeInboundFaxNoteWithBudget(
  faxId: string,
  budgetMs: number = AI_BUDGET_MS
): Promise<InboundFaxAiSummaryResult> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      summarizeInboundFaxNote(faxId),
      new Promise<InboundFaxAiSummaryResult>((resolve) => {
        timer = setTimeout(
          () => resolve({ ok: false, skipped: true, reason: "budget_exceeded" }),
          budgetMs
        );
      }),
    ]);
    return result;
  } finally {
    if (timer) clearTimeout(timer);
  }
}
