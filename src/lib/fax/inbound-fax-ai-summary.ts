import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { fetchCrmOpenAiJsonObject } from "@/lib/crm/openai-crm-task-json";
import { extractPatientReferralPdfText } from "@/lib/crm/patient-referral/pdf-text-extract";
import { saintlyCrmTaskExtractionModel } from "@/lib/crm/saintly-ai-voice-config";
import { canRunResumePdfOcr } from "@/lib/recruiting/recruiting-ocr-env";
import { isOcrSpaceRecruitingConfigured, ocrSpaceFromBuffer } from "@/lib/recruiting/ocr-space";
import { ocrPdfBuffer } from "@/lib/recruiting/resume-pdf-ocr";

/** Local constant — do not import from fax-service (avoids circular dependency). */
const FAX_DOCUMENTS_BUCKET = "fax-documents";

const NOTE_MAX_LEN = 200;
const MIN_TEXT_FOR_MODEL = 20;
/** Below this length, try OCR (scanned faxes). */
const OCR_SHORT_TEXT = 40;
const AI_BUDGET_MS = 18_000;
const EXTRACT_SEND_MAX = 8_000;

const SYSTEM_PROMPT = `You label inbound home-health faxes for a busy admin inbox.
Return JSON only: { "note": string }.

Rules for "note":
- 3 to 8 words, title-style, like a staff sticky note
- Match this style: "Signed 485", "Verse Medical supplies", "referral from Tango", "Raymond Garton Signed 485", "Tango Denied"
- Prefer: document type (485, POC, orders, referral), vendor/source (Tango, Verse, SCAN), patient last name when clear, status (signed, denied, delivered)
- Do not dump PHI (no full SSN, DOB, address, Medicare numbers)
- No full sentences or paragraphs
- If unclear, use a short best-effort label (e.g. "Inbound referral", "Insurance fax")`;

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

function normalizeAiNote(raw: unknown): string | null {
  const s = typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "";
  if (!s) return null;
  return s.slice(0, NOTE_MAX_LEN);
}

async function loadFaxPdfBytes(input: {
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

async function extractFaxTextForSummary(buffer: Buffer): Promise<{ text: string; method: string }> {
  const direct = await extractPatientReferralPdfText(buffer);
  let text = (direct.text ?? "").trim();
  let method = direct.method !== "none" ? direct.method : "none";

  if (text.length < OCR_SHORT_TEXT) {
    const preferCloud = direct.dependencyError && isOcrSpaceRecruitingConfigured();
    if (!preferCloud && canRunResumePdfOcr()) {
      try {
        const ocr = await ocrPdfBuffer(buffer, { maxPages: 3 });
        const ocrText = (ocr.text ?? "").trim();
        if (ocrText.length > text.length) {
          text = ocrText;
          method = "ocr_render";
        }
      } catch (e) {
        console.warn("[fax/ai-summary] ocr_render_failed", {
          error: e instanceof Error ? e.message : String(e),
        });
        if (isOcrSpaceRecruitingConfigured()) {
          const ocr = await ocrSpaceFromBuffer(buffer, "inbound-fax.pdf", "application/pdf");
          const ocrText = ocr.text.trim();
          if (ocrText.length > text.length) {
            text = ocrText;
            method = "ocr_space";
          }
        }
      }
    } else if (isOcrSpaceRecruitingConfigured()) {
      const ocr = await ocrSpaceFromBuffer(buffer, "inbound-fax.pdf", "application/pdf");
      const ocrText = ocr.text.trim();
      if (ocrText.length > text.length) {
        text = ocrText;
        method = "ocr_space";
      }
    }
  }

  return { text, method };
}

async function generateNoteFromText(text: string): Promise<string | null> {
  const clipped = text.slice(0, EXTRACT_SEND_MAX);
  const json = await fetchCrmOpenAiJsonObject(
    faxAiSummaryModel(),
    SYSTEM_PROMPT,
    `Fax document text:\n\n${clipped}`
  );
  const rec = asRecord(json);
  return normalizeAiNote(rec?.note);
}

async function persistNoteIfEmpty(faxId: string, note: string): Promise<boolean> {
  // Re-check immediately before write so a staff edit during AI work wins.
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
    .select("id, direction, status, note, storage_path, media_url")
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
  if (!storagePath && !mediaUrl) {
    return { ok: false, skipped: true, reason: "no_pdf" };
  }

  try {
    const buffer = await loadFaxPdfBytes({ storagePath, mediaUrl });
    if (!buffer) {
      return { ok: false, skipped: true, reason: "pdf_unavailable" };
    }

    const { text, method } = await extractFaxTextForSummary(buffer);
    if (text.length < MIN_TEXT_FOR_MODEL) {
      console.warn("[fax/ai-summary] insufficient_text", {
        fax_id: id,
        method,
        text_len: text.length,
      });
      return { ok: false, skipped: true, reason: "insufficient_text" };
    }

    const note = await generateNoteFromText(text);
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
      payload: { note, extract_method: method, text_len: text.length },
    });

    console.log("[fax/ai-summary] note_written", {
      fax_id: id,
      note,
      extract_method: method,
      text_len: text.length,
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
