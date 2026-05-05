import { NextResponse } from "next/server";

import { requireCrmTasksStaff } from "@/lib/crm/require-crm-tasks-staff";
import {
  defaultVoiceTaskExtractionContext,
  extractCrmTasksFromTranscript,
} from "@/lib/crm/voice-task-extraction";
import type { CrmTaskRelatedType } from "@/lib/crm/crm-task-types";
import {
  saintlyCrmTaskExtractionModel,
  saintlyCrmTranscriptionModelPreferred,
  saintlyVoiceTaskMaxUploadBytes,
} from "@/lib/crm/saintly-ai-voice-config";

function parseRelatedType(raw: string | null): CrmTaskRelatedType | null {
  if (!raw || !raw.trim()) return null;
  const t = raw.trim();
  if (
    t === "lead" ||
    t === "recruit" ||
    t === "employee" ||
    t === "facility" ||
    t === "patient" ||
    t === "insurance_payer" ||
    t === "general"
  ) {
    return t;
  }
  return null;
}

function asMultipartFields(fd: unknown): { get(key: string): FormDataEntryValue | null } {
  return fd as { get(key: string): FormDataEntryValue | null };
}

async function openAiSpeechToText(
  audioBytes: ArrayBuffer,
  mime: string,
  model: string,
  apiKey: string
): Promise<{ ok: true; transcript: string } | { ok: false; httpStatus: number; detail: string }> {
  const fd = new FormData();
  fd.append("file", new Blob([audioBytes], { type: mime }), "capture.webm");
  fd.append("model", model);
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: fd,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return { ok: false, httpStatus: res.status, detail: detail.slice(0, 500) };
  }
  const j = (await res.json()) as { text?: string };
  const text = typeof j.text === "string" ? j.text.trim() : "";
  if (!text) {
    return { ok: false, httpStatus: 422, detail: "empty transcript" };
  }
  return { ok: true, transcript: text };
}

/**
 * POST multipart: audio file (field `audio`) + optional CRM context fields.
 * Does not persist audio; transcribes and proposes tasks only.
 */
export async function POST(req: Request) {
  const gate = await requireCrmTasksStaff();
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "CRM voice transcription is unavailable: OPENAI_API_KEY is not set on this server. OpenAI API usage is billed separately from ChatGPT Plus.",
      },
      { status: 503 }
    );
  }

  let multipart: ReturnType<typeof asMultipartFields>;
  try {
    multipart = asMultipartFields(await req.formData());
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = multipart.get("audio");
  if (!(file instanceof Blob) || file.size <= 0) {
    return NextResponse.json({ error: "Missing audio" }, { status: 400 });
  }

  const maxBytes = saintlyVoiceTaskMaxUploadBytes();
  if (file.size > maxBytes) {
    return NextResponse.json({ error: `Audio too large (max ${maxBytes} bytes)` }, { status: 413 });
  }

  const relatedTypeRaw =
    typeof multipart.get("related_entity_type") === "string"
      ? multipart.get("related_entity_type")
      : null;
  const relatedIdRaw =
    typeof multipart.get("related_entity_id") === "string"
      ? multipart.get("related_entity_id")
      : null;
  const related_entity_type = parseRelatedType(relatedTypeRaw as string | null);
  const related_entity_id =
    typeof relatedIdRaw === "string" && relatedIdRaw.trim() ? relatedIdRaw.trim() : null;

  const ctx = defaultVoiceTaskExtractionContext({
    related_entity_type,
    related_entity_id,
  });

  const mime = typeof file.type === "string" && file.type.trim() ? file.type : "audio/webm";
  const ab = await file.arrayBuffer();

  const preferred = saintlyCrmTranscriptionModelPreferred().trim() || "whisper-1";
  let transcription_model_used = preferred;
  const firstTry = await openAiSpeechToText(ab, mime, preferred, apiKey);

  let finalOk: typeof firstTry | null = null;

  if (firstTry.ok) {
    finalOk = firstTry;
  } else if (preferred !== "whisper-1") {
    const fbTry = await openAiSpeechToText(ab, mime, "whisper-1", apiKey);
    if (fbTry.ok) {
      finalOk = fbTry;
      transcription_model_used = "whisper-1";
    }
  }

  if (!finalOk?.ok) {
    const hint = firstTry.ok ? "" : `status=${firstTry.httpStatus}`;
    console.warn("[crm/tasks/voice-capture] transcription failure", hint);
    return NextResponse.json({ error: "Transcription failed" }, { status: 502 });
  }

  const transcript = finalOk.transcript;
  const extracted = await extractCrmTasksFromTranscript(transcript, ctx);

  return NextResponse.json({
    transcript,
    tasks: extracted.tasks,
    warnings: extracted.warnings,
    related_entity_type,
    related_entity_id,
    transcription_model_used,
    extraction_model: saintlyCrmTaskExtractionModel(),
    model_note:
      "OpenAI API usage is billed separately from ChatGPT Plus. Transcription + extraction each incur cost.",
  });
}
