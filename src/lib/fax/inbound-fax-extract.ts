import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { fetchCrmOpenAiJsonObject } from "@/lib/crm/openai-crm-task-json";
import { saintlyCrmTaskExtractionModel } from "@/lib/crm/saintly-ai-voice-config";
import { extractFaxDocumentText } from "@/lib/fax/fax-document-text";
import {
  heuristicPatientFromFaxPages,
  normalizePersonName,
  parseDobToIso,
} from "@/lib/fax/fax-extraction-heuristics";
import {
  FAX_DOCUMENT_TYPES,
  PATIENT_NAME_CONFIDENCE_THRESHOLD,
  isFaxDocumentType,
  type FaxDocumentType,
  type FaxExtractionStatus,
  type FaxStructuredExtraction,
  type FaxTriageState,
} from "@/lib/fax/fax-extraction-types";
import { loadFaxPdfBytes } from "@/lib/fax/inbound-fax-ai-summary";
import { matchFaxPatient } from "@/lib/fax/match-fax-patient";

const SYSTEM_PROMPT = `You extract structured fields from inbound home-health fax packets.
Return JSON only with this shape:
{
  "patientName": string | null,
  "patientDob": string | null,
  "documentType": ${FAX_DOCUMENT_TYPES.map((t) => `"${t}"`).join(" | ")},
  "serviceDate": string | null,
  "referringProvider": string | null,
  "clinician": string | null,
  "payer": string | null,
  "senderOrg": string | null,
  "disciplines": string[],
  "confidence": { "patientName": number, "documentType": number },
  "sourcePage": number | null
}

Rules:
- Ignore cover sheets when looking for the patient. Cover sheets carry the sending facility (Woundtech, Verse Medical, Tango), not the patient. Look for Patient Name, Patient:, Pt:, Name:, Member, Client, near a DOB.
- Do not confuse the clinician/nurse (Victoria McBerty, Tawnya Grover) or the referring physician with the patient. Those names recur across many different patients.
- Handle Last, First and First Last. Normalize patientName to "Last, First".
- patientDob and serviceDate must be ISO YYYY-MM-DD or null.
- Return null rather than guessing. confidence values are 0-1.
- sourcePage is the 1-based page where the patient name was found.
- senderOrg is the sending facility (Woundtech, Verse Medical, Tango, SCAN, etc.).
- disciplines: PT, OT, SN, ST, wound care when clearly present.
- payer examples: Medicare, AHCCCS, Arizona Complete Health, UHC, Healthspring, Centerwell.`;

export type InboundFaxExtractResult =
  | { ok: true; extraction: FaxStructuredExtraction; status: FaxExtractionStatus }
  | { ok: false; skipped: true; reason: string }
  | { ok: false; skipped: false; error: string };

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function asNumber(v: unknown): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

function parseExtractionJson(json: unknown): FaxStructuredExtraction | null {
  const rec = asRecord(json);
  if (!rec) return null;
  const documentType: FaxDocumentType = isFaxDocumentType(rec.documentType) ? rec.documentType : "other";
  const conf = asRecord(rec.confidence);
  const disciplines = Array.isArray(rec.disciplines)
    ? rec.disciplines.filter((d): d is string => typeof d === "string" && d.trim().length > 0).map((d) => d.trim())
    : [];
  const sourcePageRaw = rec.sourcePage;
  const sourcePage =
    typeof sourcePageRaw === "number" && Number.isInteger(sourcePageRaw) && sourcePageRaw > 0
      ? sourcePageRaw
      : null;

  return {
    patientName: normalizePersonName(asString(rec.patientName) ?? "") ?? asString(rec.patientName),
    patientDob: parseDobToIso(asString(rec.patientDob)),
    documentType,
    serviceDate: parseDobToIso(asString(rec.serviceDate)),
    referringProvider: asString(rec.referringProvider),
    clinician: asString(rec.clinician),
    payer: asString(rec.payer),
    senderOrg: asString(rec.senderOrg),
    disciplines,
    confidence: {
      patientName: asNumber(conf?.patientName),
      documentType: asNumber(conf?.documentType),
    },
    sourcePage,
  };
}

function mergeHeuristic(
  model: FaxStructuredExtraction | null,
  heuristic: ReturnType<typeof heuristicPatientFromFaxPages>
): FaxStructuredExtraction {
  const base: FaxStructuredExtraction = model ?? {
    patientName: null,
    patientDob: null,
    documentType: "other",
    serviceDate: null,
    referringProvider: null,
    clinician: null,
    payer: null,
    senderOrg: null,
    disciplines: [],
    confidence: { patientName: 0, documentType: 0.3 },
    sourcePage: null,
  };

  if (!heuristic) return base;

  const modelNameWeak = !base.patientName || base.confidence.patientName < PATIENT_NAME_CONFIDENCE_THRESHOLD;
  if (modelNameWeak) {
    return {
      ...base,
      patientName: heuristic.patientName,
      patientDob: heuristic.patientDob ?? base.patientDob,
      sourcePage: heuristic.sourcePage,
      confidence: {
        ...base.confidence,
        patientName: Math.max(base.confidence.patientName, 0.82),
      },
    };
  }

  if (!base.sourcePage) {
    return { ...base, sourcePage: heuristic.sourcePage, patientDob: base.patientDob ?? heuristic.patientDob };
  }
  return base;
}

function resolveStatus(extraction: FaxStructuredExtraction): FaxExtractionStatus {
  if (!extraction.patientName || extraction.confidence.patientName < PATIENT_NAME_CONFIDENCE_THRESHOLD) {
    return "needs_review";
  }
  return "extracted";
}

function resolveTriage(
  current: string | null | undefined,
  status: FaxExtractionStatus,
  transmissionFailed: boolean
): FaxTriageState {
  if (transmissionFailed) return "failed";
  if (current === "reviewed" || current === "assigned" || current === "filed") {
    return current;
  }
  if (status === "needs_review" || status === "failed" || status === "media_missing") return "needs_review";
  return "new";
}

export async function extractInboundFaxStructured(
  faxId: string,
  options?: { overwriteNote?: boolean }
): Promise<InboundFaxExtractResult> {
  const id = faxId.trim();
  if (!id) return { ok: false, skipped: true, reason: "missing_fax_id" };

  const { data: row, error } = await supabaseAdmin
    .from("fax_messages")
    .select(
      "id, direction, status, storage_path, media_url, page_count, patient_id, triage_state, extraction_status"
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !row?.id) {
    return { ok: false, skipped: false, error: error?.message ?? "Fax not found" };
  }
  if (row.direction !== "inbound") {
    return { ok: false, skipped: true, reason: "not_inbound" };
  }

  const storagePath =
    typeof row.storage_path === "string" && row.storage_path.trim() ? row.storage_path.trim() : null;
  const mediaUrl = typeof row.media_url === "string" && row.media_url.trim() ? row.media_url.trim() : null;
  const pageCount = typeof row.page_count === "number" ? row.page_count : null;
  const transmissionFailed = String(row.status).toLowerCase().includes("fail");

  if (!storagePath && !mediaUrl) {
    await persistExtractionState(id, {
      extraction_status: pageCount && pageCount > 0 ? "media_missing" : "failed",
      triage_state: resolveTriage(row.triage_state as string, "media_missing", transmissionFailed),
    });
    return { ok: false, skipped: true, reason: pageCount && pageCount > 0 ? "media_missing" : "no_pdf" };
  }

  const buffer = await loadFaxPdfBytes({ storagePath, mediaUrl });
  if (!buffer) {
    await persistExtractionState(id, {
      extraction_status: pageCount && pageCount > 0 ? "media_missing" : "failed",
      triage_state: resolveTriage(row.triage_state as string, "media_missing", transmissionFailed),
    });
    return { ok: false, skipped: true, reason: pageCount && pageCount > 0 ? "media_missing" : "pdf_unavailable" };
  }

  try {
    const extracted = await extractFaxDocumentText(buffer, { faxId: id });
    const heuristic = heuristicPatientFromFaxPages(extracted.pages);

    let model: FaxStructuredExtraction | null = null;
    if (process.env.OPENAI_API_KEY?.trim() && extracted.totalChars >= 20) {
      const json = await fetchCrmOpenAiJsonObject(
        process.env.SAINTLY_FAX_AI_SUMMARY_MODEL?.trim() || saintlyCrmTaskExtractionModel(),
        SYSTEM_PROMPT,
        `Fax document text by page:\n\n${extracted.modelText}`
      );
      model = parseExtractionJson(json);
    }

    const merged = mergeHeuristic(model, heuristic);
    const status = resolveStatus(merged);
    const match = merged.patientName
      ? await matchFaxPatient({ name: merged.patientName, dob: merged.patientDob })
      : { status: "none" as const, patientId: null };

    const patch: Record<string, unknown> = {
      patient_name: merged.patientName,
      patient_dob: merged.patientDob,
      document_type: merged.documentType,
      service_date: merged.serviceDate,
      payer: merged.payer,
      sender_org: merged.senderOrg,
      referring_provider: merged.referringProvider,
      clinician: merged.clinician,
      disciplines: merged.disciplines,
      extraction_confidence: merged.confidence,
      extraction_status: status,
      extraction_source_page: merged.sourcePage,
      last_extraction_at: new Date().toISOString(),
      triage_state: resolveTriage(row.triage_state as string, status, transmissionFailed),
      patient_match_status: match.status,
    };
    if (!row.patient_id && match.status === "exact" && match.patientId) {
      patch.patient_id = match.patientId;
    }
    void options;

    const { error: writeErr } = await supabaseAdmin.from("fax_messages").update(patch).eq("id", id);
    if (writeErr) {
      return { ok: false, skipped: false, error: writeErr.message };
    }

    await supabaseAdmin.from("fax_events").insert({
      fax_message_id: id,
      event_type: "extraction_completed",
      payload: {
        status,
        source_page: merged.sourcePage,
        document_type: merged.documentType,
        has_patient_name: Boolean(merged.patientName),
        patient_match_status: match.status,
        text_len: extracted.totalChars,
        page_count: extracted.pageCount,
        ocr_pages: extracted.ocrPageCount,
        page_char_counts: extracted.pages.map((p) => ({ page: p.page, chars: p.charCount, method: p.method })),
      },
    });

    console.log("[fax/extract] structured_written", {
      fax_id: id,
      status,
      source_page: merged.sourcePage,
      document_type: merged.documentType,
      has_patient_name: Boolean(merged.patientName),
      patient_match_status: match.status,
    });

    return { ok: true, extraction: merged, status };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await persistExtractionState(id, {
      extraction_status: "failed",
      triage_state: resolveTriage(row.triage_state as string, "failed", transmissionFailed),
    });
    console.warn("[fax/extract] failed", { fax_id: id, error: msg });
    return { ok: false, skipped: false, error: msg };
  }
}

async function persistExtractionState(faxId: string, patch: Record<string, unknown>): Promise<void> {
  await supabaseAdmin
    .from("fax_messages")
    .update({ ...patch, last_extraction_at: new Date().toISOString() })
    .eq("id", faxId);
}
