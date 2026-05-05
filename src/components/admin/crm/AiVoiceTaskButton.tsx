"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  saveVoiceReviewedCrmTasksAction,
  type VoiceReviewedDraftInput,
} from "@/app/admin/crm/tasks/actions";
import type { CrmTaskPriority, CrmTaskRelatedType } from "@/lib/crm/crm-task-types";
import { SAINTLY_CRM_VOICE_PHI_OPENAI_NOTICE } from "@/lib/crm/crm-voice-phi-copy";
import { isoInstantToDatetimeLocalInput, parseAppDateTimeInputToUtcIso } from "@/lib/datetime/app-timezone";
import type { VoiceExtractedTask } from "@/lib/crm/crm-voice-task-types";

type VoiceUiState = "idle" | "recording" | "transcribing" | "reviewing" | "saving" | "error";

export type AiVoiceTaskButtonProps = {
  variant?: "default" | "compact";
  relatedEntityType?: CrmTaskRelatedType | null;
  relatedEntityId?: string | null;
  onAfterSave?: () => void;
  className?: string;
};

function pickMime(): { mime: string; ext: string } {
  if (typeof MediaRecorder === "undefined") {
    return { mime: "audio/webm", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported?.("audio/webm;codecs=opus")) {
    return { mime: "audio/webm;codecs=opus", ext: "webm" };
  }
  if (MediaRecorder.isTypeSupported?.("audio/webm")) {
    return { mime: "audio/webm", ext: "webm" };
  }
  return { mime: "audio/webm", ext: "webm" };
}

export function AiVoiceTaskButton({
  variant = "default",
  relatedEntityType = null,
  relatedEntityId = null,
  onAfterSave,
  className = "",
}: AiVoiceTaskButtonProps) {
  const router = useRouter();
  const [ui, setUi] = useState<VoiceUiState>("idle");
  const [err, setErr] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<string>("");
  const [warnings, setWarnings] = useState<string[]>([]);
  const [drafts, setDrafts] = useState<VoiceExtractedTask[]>([]);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const stopTracks = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    return () => {
      stopTracks();
      mediaRef.current = null;
    };
  }, [stopTracks]);

  const startRecording = async () => {
    setErr(null);
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setUi("error");
      setErr("Microphone is not available in this browser session.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      const { mime } = pickMime();
      const rec = new MediaRecorder(stream, { mimeType: mime });
      mediaRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stopTracks();
        void runTranscription(mime);
      };
      rec.start();
      setUi("recording");
    } catch (e) {
      console.warn("[AiVoiceTaskButton] mic", e);
      setUi("error");
      setErr("We could not access the microphone. Grant permission in your browser and try again.");
    }
  };

  const stopRecording = () => {
    const rec = mediaRef.current;
    if (rec && rec.state !== "inactive") {
      rec.stop();
    }
    mediaRef.current = null;
    setUi("transcribing");
  };

  const runTranscription = async (mime: string) => {
    const blob = new Blob(chunksRef.current, { type: mime });
    chunksRef.current = [];
    if (blob.size <= 0) {
      setUi("error");
      setErr("No audio captured.");
      return;
    }
    const fd = new FormData();
    fd.append("audio", blob, "capture.webm");
    if (relatedEntityType) fd.append("related_entity_type", relatedEntityType);
    if (relatedEntityId) fd.append("related_entity_id", relatedEntityId);

    try {
      const res = await fetch("/api/admin/crm/tasks/voice-capture", {
        method: "POST",
        body: fd,
      });
      const json = (await res.json()) as {
        error?: string;
        transcript?: string;
        tasks?: VoiceExtractedTask[];
        warnings?: string[];
      };
      if (!res.ok) {
        setUi("error");
        setErr(json.error ?? "Transcription failed");
        return;
      }
      setTranscript(typeof json.transcript === "string" ? json.transcript : "");
      setWarnings(Array.isArray(json.warnings) ? json.warnings : []);
      setDrafts(Array.isArray(json.tasks) ? json.tasks : []);
      setUi("reviewing");
    } catch (e) {
      console.warn("[AiVoiceTaskButton] upload", e);
      setUi("error");
      setErr("Network error during voice capture.");
    }
  };

  const closeModal = () => {
    setUi("idle");
    setErr(null);
    setTranscript("");
    setWarnings([]);
    setDrafts([]);
  };

  const updateDraft = (idx: number, patch: Partial<VoiceExtractedTask>) => {
    setDrafts((prev) => prev.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  };

  const removeDraft = (idx: number) => {
    setDrafts((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveDrafts = async () => {
    if (drafts.length === 0) {
      closeModal();
      return;
    }
    setUi("saving");
    setErr(null);
    try {
      const tasks: VoiceReviewedDraftInput[] = drafts
        .filter((d) => d.title.trim())
        .map((d) => ({
          title: d.title.trim(),
          description: d.description,
          due_at: d.due_at,
          priority: d.priority,
          related_entity_type: d.related_entity_type ?? relatedEntityType,
          related_entity_id: d.related_entity_id ?? relatedEntityId,
        }));
      if (!tasks.length) {
        setUi("error");
        setErr("Add at least one task with a title before saving.");
        return;
      }

      const tx = transcript.trim();
      if (!tx) {
        setUi("error");
        setErr("Transcript missing — cannot save audited voice tasks.");
        return;
      }

      const r = await saveVoiceReviewedCrmTasksAction({
        ai_transcript: tx,
        tasks,
        fallback_related_entity_type: relatedEntityType,
        fallback_related_entity_id: relatedEntityId,
      });
      if (!r.ok) {
        setUi("error");
        setErr(r.error ?? "Save failed");
        return;
      }
      onAfterSave?.();
      router.refresh();
      closeModal();
      setUi("idle");
    } catch (e) {
      console.warn("[AiVoiceTaskButton] save", e);
      setUi("error");
      setErr("Save failed");
    }
  };

  const btnCls =
    variant === "compact"
      ? "rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
      : "rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-900 shadow-sm hover:bg-violet-100";

  return (
    <>
      <button type="button" className={`${btnCls} ${className}`} onClick={() => void startRecording()} disabled={ui !== "idle"}>
        Add Task by Voice
      </button>

      {ui !== "idle" ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/40 p-4 sm:items-center">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Voice task</p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">
              {ui === "recording"
                ? "Recording…"
                : ui === "transcribing"
                  ? "Transcribing…"
                  : ui === "saving"
                    ? "Saving…"
                    : ui === "reviewing"
                      ? "Review tasks"
                      : "Voice task"}
            </h2>
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              {SAINTLY_CRM_VOICE_PHI_OPENAI_NOTICE} OpenAI API usage is metered separately from ChatGPT Plus.
            </p>

            {ui === "recording" ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-slate-700">Speak clearly. Audio is not stored—only the transcript and tasks you save.</p>
                <button
                  type="button"
                  className="w-full rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700"
                  onClick={stopRecording}
                >
                  Stop recording
                </button>
              </div>
            ) : null}

            {ui === "transcribing" || ui === "saving" ? (
              <p className="mt-4 text-sm text-slate-600">Please wait…</p>
            ) : null}

            {ui === "error" ? (
              <div className="mt-4 space-y-3">
                <p className="text-sm text-rose-700">{err ?? "Something went wrong."}</p>
                <button type="button" className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold" onClick={closeModal}>
                  Close
                </button>
              </div>
            ) : null}

            {ui === "reviewing" ? (
              <div className="mt-4 space-y-4">
                {warnings.length > 0 ? (
                  <ul className="list-inside list-disc text-xs text-amber-900">
                    {warnings.map((w) => (
                      <li key={w}>{w}</li>
                    ))}
                  </ul>
                ) : null}

                <details className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <summary className="cursor-pointer font-semibold text-slate-800">Transcript</summary>
                  <p className="mt-2 whitespace-pre-wrap text-slate-700">{transcript || "—"}</p>
                </details>

                {drafts.length === 0 ? (
                  <p className="text-sm text-slate-600">No tasks detected. Try again with a clearer request.</p>
                ) : (
                  <ul className="space-y-3">
                    {drafts.map((d, idx) => (
                      <li key={idx} className="rounded-xl border border-slate-200 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-500">Task {idx + 1}</span>
                          <button
                            type="button"
                            className="text-xs font-semibold text-rose-700 hover:underline"
                            onClick={() => removeDraft(idx)}
                          >
                            Remove
                          </button>
                        </div>
                        <label className="mt-2 block text-xs font-medium text-slate-600">
                          Title
                          <input
                            className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                            value={d.title}
                            onChange={(e) => updateDraft(idx, { title: e.target.value })}
                          />
                        </label>
                        <label className="mt-2 block text-xs font-medium text-slate-600">
                          Description
                          <textarea
                            className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                            rows={2}
                            value={d.description ?? ""}
                            onChange={(e) =>
                              updateDraft(idx, { description: e.target.value.trim() ? e.target.value : null })
                            }
                          />
                        </label>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          <label className="text-xs font-medium text-slate-600">
                            Priority
                            <select
                              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                              value={d.priority}
                              onChange={(e) => updateDraft(idx, { priority: e.target.value as CrmTaskPriority })}
                            >
                              <option value="low">Low</option>
                              <option value="normal">Normal</option>
                              <option value="high">High</option>
                              <option value="urgent">Urgent</option>
                            </select>
                          </label>
                          <label className="text-xs font-medium text-slate-600">
                            Due (Phoenix wall time)
                            <input
                              type="datetime-local"
                              className="mt-0.5 w-full rounded border border-slate-200 px-2 py-1 text-sm"
                              value={d.due_at ? isoInstantToDatetimeLocalInput(d.due_at) : ""}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v) {
                                  updateDraft(idx, { due_at: null });
                                  return;
                                }
                                const iso = parseAppDateTimeInputToUtcIso(v);
                                updateDraft(idx, { due_at: iso });
                              }}
                            />
                          </label>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                    onClick={() => void saveDrafts()}
                    disabled={drafts.length === 0}
                  >
                    Save selected tasks
                  </button>
                  <button type="button" className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold" onClick={closeModal}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
