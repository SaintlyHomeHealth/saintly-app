"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { FacilityPhotoAnalysisConfirmModal } from "@/app/admin/facilities/_components/FacilityPhotoAnalysisConfirmModal";
import {
  FacilityPhotoPicker,
  pendingPhotoFiles,
  type PendingPhoto,
} from "@/app/admin/facilities/_components/FacilityPhotoPicker";
import {
  confirmFacilityPhotoActions,
  runFacilityPhotoPostSaveWorkflow,
  type PhotoAnalysisDraft,
} from "@/app/admin/facilities/_components/FacilityPhotoWorkflow";
import { uploadFacilityPhotoFiles } from "@/lib/crm/facility-photo-client";
import { FacilityQuickLogModal } from "@/app/admin/facilities/_components/FacilityQuickLogModal";
import { FacilityReferralLeadModal } from "@/app/admin/facilities/_components/FacilityReferralLeadModal";
import { FacilityPacketRequestModal } from "@/app/admin/facilities/_components/FacilityPacketRequestModal";
import {
  inferDeliveryMethodFromOutcome,
  shouldDefaultCreatePacketRequest,
} from "@/lib/crm/facility-packet-types";
import type { FacilityReferralAiDetection } from "@/lib/crm/facility-referral-lead-types";
import {
  QUICK_LOG_ACTIVITY_CHIPS,
  QUICK_LOG_OUTCOME_CHIPS,
  QUICK_LOG_REFERRAL_POTENTIAL,
} from "@/lib/crm/facility-quick-log";
import { getFacilityRouteDraft } from "@/lib/crm/facility-route-draft";
import {
  enqueueOfflineItem,
  getOfflineQueueUserId,
  isNetworkError,
} from "@/lib/crm/facility-offline-queue";
import { useFacilityOnlineStatus } from "@/app/admin/facilities/_components/useFacilityOnlineStatus";

export type FacilityAiCaptureSourceContext =
  | "finder"
  | "discover"
  | "route_builder"
  | "facility_detail"
  | "facilities_list";

type FacilityAiPossibleMatch = {
  id: string;
  name: string;
  city: string | null;
  match_confidence: number;
  match_reason: string;
};

type FacilityAiCaptureDraft = {
  facility_name: string | null;
  matched_facility_id: string | null;
  matched_facility_name: string | null;
  match_confidence: number;
  match_reason: string | null;
  possible_matches: FacilityAiPossibleMatch[];
  activity_type: string;
  outcome: string | null;
  notes: string;
  contact_name: string | null;
  contact_role: string | null;
  follow_up_task: string | null;
  next_follow_up_at: string | null;
  materials_dropped_off: boolean;
  requested_packet: boolean;
  referral_process_captured: boolean;
  decision_maker_met: boolean;
  referral_potential: string | null;
  confidence: number;
  warnings: string[];
  needs_user_confirmation: boolean;
  ai_summary: string | null;
  referral_detection: FacilityReferralAiDetection | null;
};

export type FacilityAiCaptureModalProps = {
  open: boolean;
  facilityId?: string;
  facilityName?: string;
  defaultText?: string;
  currentLatitude?: number;
  currentLongitude?: number;
  sourceContext?: FacilityAiCaptureSourceContext;
  campaignStepInstanceId?: string;
  onSaved?: () => void;
  onSavedMessage?: (message: string) => void;
  onClose: () => void;
  userId?: string;
  relatedRouteId?: string | null;
  relatedStopId?: string | null;
  onOfflineQueued?: () => void;
};

type Step = "capture" | "confirm" | "fallback";

const textareaCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200";
const inputCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm focus:border-violet-400 focus:outline-none focus:ring-2 focus:ring-violet-200";
const selectCls = inputCls;

function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function dateInputToIso(dateStr: string): string | null {
  if (!dateStr.trim()) return null;
  const d = new Date(`${dateStr}T17:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

type SpeechRecognitionCtor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((ev: {
    resultIndex: number;
    results: {
      length: number;
      [index: number]: { isFinal: boolean; [altIndex: number]: { transcript: string } };
    };
  }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

function joinText(a: string, b: string) {
  return [a.trim(), b.trim()].filter(Boolean).join(" ");
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function FacilityAiCaptureModal({
  open,
  facilityId,
  facilityName,
  defaultText = "",
  currentLatitude: initialLat,
  currentLongitude: initialLng,
  sourceContext,
  campaignStepInstanceId,
  onSaved,
  onSavedMessage,
  onClose,
  userId,
  relatedRouteId,
  relatedStopId,
  onOfflineQueued,
}: FacilityAiCaptureModalProps) {
  const { isOffline } = useFacilityOnlineStatus();
  const [step, setStep] = useState<Step>("capture");
  const [rawText, setRawText] = useState(defaultText);
  const [latitude, setLatitude] = useState<number | null>(initialLat ?? null);
  const [longitude, setLongitude] = useState<number | null>(initialLng ?? null);
  const [locating, setLocating] = useState(false);
  const [listening, setListening] = useState(false);
  const [speechSupported] = useState(() => Boolean(getSpeechRecognition()));
  const recognitionRef = useRef<InstanceType<SpeechRecognitionCtor> | null>(null);
  const baseNoteRef = useRef("");
  const finalTranscriptRef = useRef("");

  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<FacilityAiCaptureDraft | null>(null);
  const [selectedFacilityId, setSelectedFacilityId] = useState<string | null>(facilityId ?? null);
  const [selectedFacilityName, setSelectedFacilityName] = useState<string | null>(facilityName ?? null);
  const [quickLogOpen, setQuickLogOpen] = useState(false);
  const [quickLogNotes, setQuickLogNotes] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [uploadedPhotoIds, setUploadedPhotoIds] = useState<string[]>([]);
  const [photoConfirmOpen, setPhotoConfirmOpen] = useState(false);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisDraft | null>(null);
  const [savedActivityId, setSavedActivityId] = useState<string | null>(null);
  const [photoAiConfigured, setPhotoAiConfigured] = useState(true);
  const [photoConfirmSaving, setPhotoConfirmSaving] = useState(false);
  const [referralModalOpen, setReferralModalOpen] = useState(false);
  const [completeCampaignStep, setCompleteCampaignStep] = useState(Boolean(campaignStepInstanceId));
  const [referralAfterSaveActivityId, setReferralAfterSaveActivityId] = useState<string | null>(null);
  const [packetModalOpen, setPacketModalOpen] = useState(false);
  const [packetAfterSaveActivityId, setPacketAfterSaveActivityId] = useState<string | null>(null);
  const [referralSaveIntent, setReferralSaveIntent] = useState(false);

  const resetCapture = useCallback(() => {
    setStep("capture");
    setRawText(defaultText);
    setDraft(null);
    setError(null);
    setSelectedFacilityId(facilityId ?? null);
    setSelectedFacilityName(facilityName ?? null);
    setLatitude(initialLat ?? null);
    setLongitude(initialLng ?? null);
    setPendingPhotos([]);
    setUploadedPhotoIds([]);
    setPhotoConfirmOpen(false);
    setPhotoAnalysis(null);
    setSavedActivityId(null);
    setReferralModalOpen(false);
    setReferralAfterSaveActivityId(null);
    setReferralSaveIntent(false);
  }, [defaultText, facilityId, facilityName, initialLat, initialLng]);

  useEffect(() => {
    if (!open) {
      setStep("capture");
      setAnalyzing(false);
      setSaving(false);
      setListening(false);
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
      return;
    }
    resetCapture();
  }, [open, resetCapture]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          /* ignore */
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  if (!open) return null;

  const needsFacilityPick =
    !selectedFacilityId ||
    (draft != null && draft.match_confidence < 0.8 && !facilityId);

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError("Location is not available in this browser.");
      return;
    }
    setLocating(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLatitude(pos.coords.latitude);
        setLongitude(pos.coords.longitude);
        setLocating(false);
      },
      () => {
        setError("Could not get your location. Check browser permissions.");
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  function stopVoiceNote() {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setListening(false);
  }

  function startVoiceNote() {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      alert("Voice notes are not supported in this browser.");
      return;
    }

    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        /* ignore */
      }
      recognitionRef.current = null;
    }

    const recognition = new Ctor();
    recognitionRef.current = recognition;

    baseNoteRef.current = rawText || "";
    finalTranscriptRef.current = "";

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (ev) => {
      let interimTranscript = "";

      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const transcript = ev.results[i][0]?.transcript || "";

        if (ev.results[i].isFinal) {
          finalTranscriptRef.current = joinText(finalTranscriptRef.current, transcript);
        } else {
          interimTranscript = joinText(interimTranscript, transcript);
        }
      }

      const voiceText = joinText(finalTranscriptRef.current, interimTranscript);
      setRawText(joinText(baseNoteRef.current, voiceText));
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    recognition.onerror = () => {
      recognitionRef.current = null;
      setListening(false);
    };

    setListening(true);
    recognition.start();
  }

  function toggleVoice() {
    if (listening && recognitionRef.current) {
      stopVoiceNote();
      return;
    }
    startVoiceNote();
  }

  async function handleAnalyze() {
    const text = rawText.trim();
    if (text.length < 8) {
      setError("Add a bit more detail so AI can extract the visit.");
      return;
    }

    if (isOffline) {
      const uid = userId ?? getOfflineQueueUserId();
      if (!uid) {
        setError("Could not save offline draft. Sign in again.");
        return;
      }
      await enqueueOfflineItem({
        type: "ai_capture_note",
        user_id: uid,
        payload: {
          raw_text: text,
          selected_facility_id: facilityId ?? selectedFacilityId,
          selected_facility_name: facilityName ?? selectedFacilityName,
          current_latitude: latitude,
          current_longitude: longitude,
          source_context: sourceContext,
        },
        related_facility_id: facilityId ?? selectedFacilityId ?? null,
        related_route_id: relatedRouteId ?? null,
        related_stop_id: relatedStopId ?? null,
        facility_name: facilityName ?? selectedFacilityName,
      });
      onOfflineQueued?.();
      onSavedMessage?.("AI analysis requires internet. Draft saved. Analyze when online.");
      onClose();
      return;
    }

    setAnalyzing(true);
    setError(null);

    const routeDraft = getFacilityRouteDraft();
    const route_draft_stops = routeDraft.stops.map((s) => ({
      facilityId: s.facilityId,
      googlePlaceId: s.googlePlaceId,
      name: s.name,
    }));

    try {
      const res = await fetch("/api/facilities/ai-capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_text: text,
          selected_facility_id: facilityId ?? selectedFacilityId,
          selected_facility_name: facilityName ?? selectedFacilityName,
          current_latitude: latitude,
          current_longitude: longitude,
          source_context: sourceContext,
          route_draft_stops,
        }),
      });

      const data = (await res.json()) as { ok: boolean; error?: string; draft?: FacilityAiCaptureDraft };

      if (!data.ok || !data.draft) {
        if (data.error === "ai_not_configured") {
          setError("AI Capture is not configured yet. Use Quick Log instead.");
        } else if (data.error === "note_too_short") {
          setError("Add a bit more detail so AI can extract the visit.");
        } else {
          setStep("fallback");
        }
        return;
      }

      const d = data.draft;
      let merged = { ...d };

      const analyzeFacilityId = facilityId ?? selectedFacilityId ?? d.matched_facility_id;
      const photoFiles = pendingPhotoFiles(pendingPhotos);
      if (photoFiles.length > 0 && analyzeFacilityId) {
        const uploaded = await uploadFacilityPhotoFiles({
          facilityId: analyzeFacilityId,
          files: photoFiles,
        });
        if (uploaded.ok) {
          const ids = uploaded.photos.map((p) => p.id);
          setUploadedPhotoIds(ids);
          const photoRes = await fetch("/api/facilities/photos/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              facility_id: analyzeFacilityId,
              photo_ids: ids,
              context_note: text,
              source_context: "ai_capture",
            }),
          });
          const photoData = (await photoRes.json()) as {
            ok: boolean;
            analysis?: PhotoAnalysisDraft;
          };
          if (photoData.ok && photoData.analysis) {
            const pa = photoData.analysis;
            if (pa.suggested_actions.materials_dropped_off) merged.materials_dropped_off = true;
            if (pa.suggested_actions.requested_packet) merged.requested_packet = true;
            if (pa.suggested_actions.contact_name && !merged.contact_name) {
              merged.contact_name = pa.suggested_actions.contact_name;
              merged.contact_role = pa.suggested_actions.contact_role;
            }
            if (pa.summary) {
              merged.notes = merged.notes ? `${merged.notes}\n\nPhoto: ${pa.summary}` : `Photo: ${pa.summary}`;
            }
            merged.warnings = [...merged.warnings, ...pa.warnings];
          }
        }
      }

      setDraft(merged);
      setReferralSaveIntent(Boolean(merged.referral_detection?.should_create_referral_lead));
      if (facilityId) {
        setSelectedFacilityId(facilityId);
        setSelectedFacilityName(facilityName ?? d.matched_facility_name);
      } else if (merged.matched_facility_id && merged.match_confidence >= 0.8) {
        setSelectedFacilityId(merged.matched_facility_id);
        setSelectedFacilityName(merged.matched_facility_name);
      } else {
        setSelectedFacilityId(merged.matched_facility_id);
        setSelectedFacilityName(merged.matched_facility_name);
      }
      setStep("confirm");
    } catch (err) {
      if (isNetworkError(err)) {
        const uid = userId ?? getOfflineQueueUserId();
        if (uid) {
          await enqueueOfflineItem({
            type: "ai_capture_note",
            user_id: uid,
            payload: {
              raw_text: text,
              selected_facility_id: facilityId ?? selectedFacilityId,
              selected_facility_name: facilityName ?? selectedFacilityName,
              current_latitude: latitude,
              current_longitude: longitude,
              source_context: sourceContext,
            },
            related_facility_id: facilityId ?? selectedFacilityId ?? null,
            related_route_id: relatedRouteId ?? null,
            related_stop_id: relatedStopId ?? null,
            facility_name: facilityName ?? selectedFacilityName,
          });
          onOfflineQueued?.();
          onSavedMessage?.("AI analysis requires internet. Draft saved. Analyze when online.");
          onClose();
          return;
        }
      }
      setStep("fallback");
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleSave() {
    if (!draft || !selectedFacilityId) {
      setError("Choose a facility before saving.");
      return;
    }

    if ((draft.follow_up_task ?? "").trim() && !draft.next_follow_up_at) {
      setError("Follow-up task needs a due date.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/facilities/ai-capture/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility_id: selectedFacilityId,
          activity_type: draft.activity_type,
          outcome: draft.outcome,
          notes: draft.notes,
          contact_name: draft.contact_name,
          contact_role: draft.contact_role,
          follow_up_task: draft.follow_up_task,
          next_follow_up_at: draft.next_follow_up_at,
          materials_dropped_off: draft.materials_dropped_off,
          requested_packet: draft.requested_packet,
          referral_process_captured: draft.referral_process_captured,
          decision_maker_met: draft.decision_maker_met,
          referral_potential: draft.referral_potential,
          ai_summary: draft.ai_summary,
          ai_extracted_json: { ...draft, raw_text: rawText },
          campaign_step_instance_id: campaignStepInstanceId ?? null,
          complete_campaign_step: completeCampaignStep && Boolean(campaignStepInstanceId),
        }),
      });

      const data = (await res.json()) as {
        ok: boolean;
        error?: string;
        activity?: { id?: string };
        task_created?: boolean;
      };
      if (!data.ok) {
        setError(
          data.error === "facility_not_found"
            ? "Facility not found."
            : data.error === "invalid_activity_type"
              ? "Invalid activity type."
              : "Could not save activity. Try Quick Log instead."
        );
        return;
      }

      const activityId = String(data.activity?.id ?? "");
      const remainingPhotos = pendingPhotoFiles(pendingPhotos);

      if (activityId && (uploadedPhotoIds.length > 0 || remainingPhotos.length > 0)) {
        if (uploadedPhotoIds.length > 0) {
          const photoRes = await fetch("/api/facilities/photos/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              facility_id: selectedFacilityId,
              activity_id: activityId,
              photo_ids: uploadedPhotoIds,
              context_note: rawText.trim() || null,
              source_context: "ai_capture",
            }),
          });
          const photoData = (await photoRes.json()) as {
            ok: boolean;
            analysis?: PhotoAnalysisDraft;
            error?: string;
          };
          if (photoData.ok && photoData.analysis) {
            setSavedActivityId(activityId);
            setPhotoAnalysis(photoData.analysis);
            setPhotoAiConfigured(true);
            setPhotoConfirmOpen(true);
            if (data.task_created) {
              onSavedMessage?.("Activity saved and follow-up task created.");
            } else {
              onSaved?.();
            }
            return;
          }
          if (photoData.error === "ai_not_configured") {
            await confirmFacilityPhotoActions({
              facilityId: selectedFacilityId,
              activityId,
              photoIds: uploadedPhotoIds,
              analysis: null,
              applyActions: false,
              contactMode: "skip",
            });
          }
        } else if (remainingPhotos.length > 0) {
          const workflow = await runFacilityPhotoPostSaveWorkflow({
            facilityId: selectedFacilityId,
            activityId,
            photos: remainingPhotos,
            contextNote: rawText.trim() || undefined,
            sourceContext: "ai_capture",
          });
          if (workflow.showConfirm && workflow.analysis) {
            setSavedActivityId(activityId);
            setUploadedPhotoIds(workflow.photoIds);
            setPhotoAnalysis(workflow.analysis);
            setPhotoAiConfigured(workflow.aiConfigured);
            setPhotoConfirmOpen(true);
            if (data.task_created) {
              onSavedMessage?.("Activity saved and follow-up task created.");
            } else {
              onSaved?.();
            }
            return;
          }
        }
      }

      if (data.task_created) {
        onSavedMessage?.("Activity saved and follow-up task created.");
      } else {
        onSaved?.();
      }

      const detection = draft.referral_detection;
      if (referralSaveIntent && detection?.should_create_referral_lead && activityId) {
        setReferralAfterSaveActivityId(activityId);
        setReferralModalOpen(true);
        return;
      }

      if (activityId && shouldDefaultCreatePacketRequest(draft.outcome, draft.requested_packet)) {
        setPacketAfterSaveActivityId(activityId);
        setPacketModalOpen(true);
        return;
      }

      onClose();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  function openQuickLogFallback() {
    setQuickLogNotes(rawText.trim());
    if (selectedFacilityId && selectedFacilityName) {
      setQuickLogOpen(true);
      return;
    }
    if (facilityId && facilityName) {
      setQuickLogOpen(true);
      return;
    }
    setError("Choose a facility or open AI Capture from a facility card to use Quick Log.");
  }

  const quickLogFacilityId = selectedFacilityId ?? facilityId ?? "";
  const quickLogFacilityName = selectedFacilityName ?? facilityName ?? "Facility";

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
        <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-capture-title"
          className="relative z-10 flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl"
        >
          <div className="shrink-0 border-b border-slate-100 px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">AI Capture</p>
            <h2 id="ai-capture-title" className="mt-1 text-lg font-semibold leading-snug text-slate-900">
              {step === "capture" ? "Capture field note" : step === "confirm" ? "Confirm activity" : "Could not analyze"}
            </h2>
            {(facilityName ?? selectedFacilityName) ? (
              <p className="mt-1 text-sm text-slate-600">
                Logging for: <span className="font-semibold text-slate-800">{facilityName ?? selectedFacilityName}</span>
              </p>
            ) : null}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            {step === "capture" ? (
              <div className="space-y-4">
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Your note
                  <textarea
                    value={rawText}
                    onChange={(e) => setRawText(e.target.value)}
                    className={`${textareaCls} min-h-[9rem]`}
                    placeholder="Example: Stopped by, left postcards, Maria handles referrals, asked us to fax packet, follow up next week."
                    autoFocus
                  />
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={useMyLocation}
                    disabled={locating}
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 hover:border-violet-300 hover:bg-violet-50 disabled:opacity-50"
                  >
                    {locating ? "Getting location…" : latitude != null ? "Location on ✓" : "Use My Location"}
                  </button>
                  {speechSupported ? (
                    <button
                      type="button"
                      onClick={toggleVoice}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${
                        listening
                          ? "border-red-300 bg-red-50 text-red-800"
                          : "border-slate-200 bg-white text-slate-800 hover:border-violet-300 hover:bg-violet-50"
                      }`}
                    >
                      {listening ? "Stop voice note" : "Start voice note"}
                    </button>
                  ) : null}
                </div>

                <FacilityPhotoPicker photos={pendingPhotos} onChange={setPendingPhotos} disabled={analyzing} />

                {error ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {error}
                    {error.includes("not configured") && quickLogFacilityId ? (
                      <button
                        type="button"
                        onClick={() => setQuickLogOpen(true)}
                        className="mt-2 block text-xs font-semibold text-sky-800 underline"
                      >
                        Open Quick Log
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === "confirm" && draft ? (
              <div className="space-y-4">
                {(draft.match_confidence < 0.8 || draft.possible_matches.length > 0) && !facilityId ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                    <p className="text-sm font-semibold text-amber-950">
                      {draft.match_confidence < 0.8
                        ? "AI is not sure which facility this belongs to."
                        : "Confirm the facility for this note."}
                    </p>
                    {draft.possible_matches.length > 0 ? (
                      <div className="mt-2 space-y-1.5">
                        {draft.possible_matches.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              setSelectedFacilityId(m.id);
                              setSelectedFacilityName(m.name);
                            }}
                            className={`block w-full rounded-lg border px-3 py-2 text-left text-sm ${
                              selectedFacilityId === m.id
                                ? "border-violet-600 bg-violet-50 font-semibold text-violet-950"
                                : "border-slate-200 bg-white text-slate-800 hover:border-violet-300"
                            }`}
                          >
                            <span>{m.name}</span>
                            {m.city ? <span className="text-slate-500"> · {m.city}</span> : null}
                            <span className="mt-0.5 block text-[11px] text-slate-500">
                              {Math.round(m.match_confidence * 100)}% — {m.match_reason}
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {draft.confidence < 0.55 || draft.warnings.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                    {draft.confidence < 0.55 ? (
                      <p className="font-semibold">Low confidence — please review all fields.</p>
                    ) : null}
                    {draft.warnings.map((w) => (
                      <p key={w} className="mt-1">
                        {w}
                      </p>
                    ))}
                  </div>
                ) : null}

                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Activity type
                  <select
                    value={draft.activity_type}
                    onChange={(e) => setDraft({ ...draft, activity_type: e.target.value })}
                    className={selectCls}
                  >
                    {QUICK_LOG_ACTIVITY_CHIPS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Outcome
                  <select
                    value={draft.outcome ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, outcome: e.target.value || null })
                    }
                    className={selectCls}
                  >
                    <option value="">—</option>
                    {QUICK_LOG_OUTCOME_CHIPS.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Notes
                  <textarea
                    value={draft.notes}
                    onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    className={`${textareaCls} min-h-[4.5rem] text-sm`}
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Contact name
                    <input
                      type="text"
                      value={draft.contact_name ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, contact_name: e.target.value.trim() || null })
                      }
                      className={inputCls}
                    />
                  </label>
                  <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Contact role
                    <input
                      type="text"
                      value={draft.contact_role ?? ""}
                      onChange={(e) =>
                        setDraft({ ...draft, contact_role: e.target.value.trim() || null })
                      }
                      className={inputCls}
                    />
                  </label>
                </div>

                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Follow-up task
                  <input
                    type="text"
                    value={draft.follow_up_task ?? ""}
                    onChange={(e) =>
                      setDraft({ ...draft, follow_up_task: e.target.value.trim() || null })
                    }
                    className={inputCls}
                  />
                </label>

                {(draft.follow_up_task ?? "").trim() && !draft.next_follow_up_at ? (
                  <p className="mt-1 text-xs font-semibold text-amber-800">
                    Follow-up task needs a due date.
                  </p>
                ) : null}
                <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Next follow-up date
                  <input
                    type="date"
                    value={isoToDateInput(draft.next_follow_up_at)}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        next_follow_up_at: dateInputToIso(e.target.value),
                      })
                    }
                    className={inputCls}
                  />
                </label>

                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
                  {(draft.requested_packet ||
                    draft.outcome === "Wants Packet Faxed" ||
                    draft.outcome === "Wants Email Info") && (
                    <div className="col-span-2 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-xs font-semibold text-violet-900">
                      Packet request detected — a packet request can be created after you save.
                    </div>
                  )}
                  {(
                    [
                      ["materials_dropped_off", "Materials dropped off"],
                      ["requested_packet", "Packet requested"],
                      ["referral_process_captured", "Referral process captured"],
                      ["decision_maker_met", "Decision maker met"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 text-sm text-slate-800">
                      <input
                        type="checkbox"
                        checked={draft[key]}
                        onChange={(e) => setDraft({ ...draft, [key]: e.target.checked })}
                        className="rounded border-slate-300"
                      />
                      {label}
                    </label>
                  ))}
                </div>

                <fieldset>
                  <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Referral potential
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {QUICK_LOG_REFERRAL_POTENTIAL.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setDraft({
                            ...draft,
                            referral_potential: draft.referral_potential === p ? null : p,
                          })
                        }
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                          draft.referral_potential === p
                            ? "border-violet-600 bg-violet-600 text-white"
                            : "border-slate-200 bg-white text-slate-700"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {draft.referral_detection?.referral_detected ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 px-4 py-3">
                    <p className="text-sm font-semibold text-emerald-900">Referral opportunity detected</p>
                    {draft.referral_detection.referral_notes ? (
                      <p className="mt-1 text-xs text-emerald-800">{draft.referral_detection.referral_notes}</p>
                    ) : null}
                    <label className="mt-3 flex items-center gap-2 text-sm text-emerald-900">
                      <input
                        type="checkbox"
                        checked={referralSaveIntent}
                        onChange={(e) => setReferralSaveIntent(e.target.checked)}
                        className="rounded border-emerald-300"
                      />
                      Create referral lead after saving activity
                    </label>
                  </div>
                ) : null}

                <p className="text-[11px] text-slate-500">
                  AI confidence: {Math.round(draft.confidence * 100)}%
                  {draft.match_reason ? ` · Match: ${draft.match_reason}` : ""}
                </p>

                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </div>
                ) : null}
              </div>
            ) : null}

            {step === "fallback" ? (
              <div className="space-y-4">
                <p className="text-sm text-slate-700">
                  AI Capture could not analyze this note. You can still save it manually.
                </p>
                {error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="sticky bottom-0 flex shrink-0 flex-wrap gap-2 border-t border-slate-100 bg-white px-5 py-4">
            {step === "capture" ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={analyzing || rawText.trim().length < 8}
                  onClick={() => void handleAnalyze()}
                  className="flex-[2] rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
                >
                  {analyzing ? "Analyzing…" : "Analyze with AI"}
                </button>
              </>
            ) : null}

            {step === "confirm" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setStep("capture");
                    setError(null);
                  }}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Edit Note
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={saving || needsFacilityPick}
                  onClick={() => void handleSave()}
                  className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50 sm:w-auto sm:flex-[2]"
                >
                  {saving ? "Saving…" : "Save Activity"}
                </button>
              </>
            ) : null}

            {step === "fallback" ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    setStep("capture");
                    setError(null);
                  }}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Try Again
                </button>
                <button
                  type="button"
                  onClick={openQuickLogFallback}
                  disabled={!quickLogFacilityId}
                  className="flex-1 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900 disabled:opacity-50"
                >
                  Open Quick Log
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
              </>
            ) : null}
          </div>
        </div>
      </div>

      {quickLogFacilityId ? (
        <FacilityQuickLogModal
          facilityId={quickLogFacilityId}
          facilityName={quickLogFacilityName}
          defaultNotes={quickLogNotes}
          open={quickLogOpen}
          onClose={() => setQuickLogOpen(false)}
          onSaved={() => {
            setQuickLogOpen(false);
            onSaved?.();
            onClose();
          }}
        />
      ) : null}

      <FacilityPhotoAnalysisConfirmModal
        open={photoConfirmOpen}
        analysis={photoAnalysis}
        aiConfigured={photoAiConfigured}
        saving={photoConfirmSaving}
        onClose={() => {
          setPhotoConfirmOpen(false);
          onClose();
        }}
        onEdit={() => setPhotoConfirmOpen(false)}
        onSavePhotoOnly={() => {
          if (!savedActivityId || !selectedFacilityId) {
            setPhotoConfirmOpen(false);
            onClose();
            return;
          }
          setPhotoConfirmSaving(true);
          void confirmFacilityPhotoActions({
            facilityId: selectedFacilityId,
            activityId: savedActivityId,
            photoIds: uploadedPhotoIds,
            analysis: photoAnalysis,
            applyActions: false,
            contactMode: "skip",
          }).finally(() => {
            setPhotoConfirmSaving(false);
            setPhotoConfirmOpen(false);
            onClose();
          });
        }}
        onConfirm={({ applyActions, contactMode }) => {
          if (!savedActivityId || !selectedFacilityId) return;
          setPhotoConfirmSaving(true);
          void confirmFacilityPhotoActions({
            facilityId: selectedFacilityId,
            activityId: savedActivityId,
            photoIds: uploadedPhotoIds,
            analysis: photoAnalysis,
            applyActions,
            contactMode,
          }).finally(() => {
            setPhotoConfirmSaving(false);
            setPhotoConfirmOpen(false);
            onClose();
          });
        }}
      />

      <FacilityReferralLeadModal
        open={referralModalOpen}
        facilityId={selectedFacilityId ?? facilityId ?? ""}
        facilityName={selectedFacilityName ?? facilityName ?? "Facility"}
        defaults={{
          activityId: referralAfterSaveActivityId,
          defaultNotes: draft?.referral_detection?.referral_notes ?? draft?.notes ?? undefined,
          patientFirstName: draft?.referral_detection?.patient_first_name ?? undefined,
          patientLastName: draft?.referral_detection?.patient_last_name ?? undefined,
          patientPhone: draft?.referral_detection?.patient_phone ?? undefined,
          patientDob: draft?.referral_detection?.patient_dob,
          payer: draft?.referral_detection?.payer ?? undefined,
          serviceNeeded: draft?.referral_detection?.service_needed ?? undefined,
          originatingActivityType: draft?.activity_type ?? null,
          originatingOutcome: draft?.outcome ?? null,
        }}
        onClose={() => {
          setReferralModalOpen(false);
          onClose();
        }}
        onCreated={() => {
          setReferralModalOpen(false);
          onClose();
        }}
      />

      <FacilityPacketRequestModal
        open={packetModalOpen}
        onClose={() => {
          setPacketModalOpen(false);
          onClose();
        }}
        facilityId={selectedFacilityId ?? facilityId ?? ""}
        facilityName={selectedFacilityName ?? facilityName ?? "Facility"}
        activityId={packetAfterSaveActivityId ?? undefined}
        defaultDeliveryMethod={inferDeliveryMethodFromOutcome(draft?.outcome) ?? undefined}
        defaultRecipient={{
          name: draft?.contact_name ?? undefined,
          role: draft?.contact_role ?? undefined,
        }}
        defaultNotes={draft?.notes ?? undefined}
        defaultOutcome={draft?.outcome}
        source="ai_capture"
        onCreated={() => {
          setPacketModalOpen(false);
          onSavedMessage?.("Packet request created.");
          onClose();
        }}
      />
    </>
  );
}
