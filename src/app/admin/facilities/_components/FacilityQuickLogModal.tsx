"use client";

import { useEffect, useState } from "react";

import { FacilityPhotoAnalysisConfirmModal } from "@/app/admin/facilities/_components/FacilityPhotoAnalysisConfirmModal";
import { FacilityReferralProfileUpdatePrompt } from "@/app/admin/facilities/_components/FacilityReferralProfileUpdatePrompt";
import { FacilityPostActivityActions } from "@/app/admin/facilities/_components/FacilityPostActivityActions";
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
import type { QuickLogResponse } from "@/app/api/facilities/[facilityId]/quick-log/route";
import {
  followUpIsoFromPreset,
  QUICK_LOG_ACTIVITY_CHIPS,
  QUICK_LOG_DEFAULT_ACTIVITY,
  QUICK_LOG_DEFAULT_OUTCOME,
  QUICK_LOG_OUTCOME_CHIPS,
  QUICK_LOG_REFERRAL_POTENTIAL,
  type QuickLogFollowUpPreset,
} from "@/lib/crm/facility-quick-log";
import { isReferralLeadSuggestedOutcome } from "@/lib/crm/facility-referral-lead-client";
import { shouldDefaultCreatePacketRequest } from "@/lib/crm/facility-packet-types";
import {
  enqueueOfflineItem,
  getOfflineQueueUserId,
  isNetworkError,
} from "@/lib/crm/facility-offline-queue";
import { useFacilityOnlineStatus } from "@/app/admin/facilities/_components/useFacilityOnlineStatus";
import { extractReferralProcessHintFromNotes } from "@/lib/crm/facility-referral-profile-client";
import type { ReferralProfileUpdateFromActivityPrompt } from "@/lib/crm/facility-referral-profile-types";

type StaffOption = { user_id: string; label: string };
type ContactOption = { id: string; name: string };

export type FacilityQuickLogModalProps = {
  facilityId: string;
  facilityName: string;
  defaultActivityType?: string;
  defaultOutcome?: string;
  defaultNotes?: string;
  contacts?: ContactOption[];
  staffOptions?: StaffOption[];
  defaultRepId?: string | null;
  campaignStepInstanceId?: string | null;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
  onActivitySaved?: (activityId: string) => void;
  /** Custom toast after save (e.g. when follow-up task created). */
  onSavedMessage?: (message: string) => void;
  onAdvancedLog?: () => void;
  userId?: string;
  relatedRouteId?: string | null;
  relatedStopId?: string | null;
  onOfflineQueued?: () => void;
};

const chipCls =
  "rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition active:scale-[0.98]";
const chipOn = `${chipCls} border-sky-600 bg-sky-600 text-white shadow-sm`;
const chipOff = `${chipCls} border-slate-200 bg-white text-slate-800 hover:border-sky-300 hover:bg-sky-50`;

const textareaCls =
  "mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-200";

export function FacilityQuickLogModal({
  facilityId,
  facilityName,
  defaultActivityType = QUICK_LOG_DEFAULT_ACTIVITY,
  defaultOutcome = QUICK_LOG_DEFAULT_OUTCOME,
  defaultNotes = "",
  contacts = [],
  staffOptions = [],
  defaultRepId,
  campaignStepInstanceId,
  open,
  onClose,
  onSaved,
  onActivitySaved,
  onSavedMessage,
  onAdvancedLog,
  userId,
  relatedRouteId,
  relatedStopId,
  onOfflineQueued,
}: FacilityQuickLogModalProps) {
  const { isOffline } = useFacilityOnlineStatus();
  const [activityType, setActivityType] = useState(defaultActivityType);
  const [outcome, setOutcome] = useState(defaultOutcome);
  const [notes, setNotes] = useState("");
  const [followUpPreset, setFollowUpPreset] = useState<QuickLogFollowUpPreset>("none");
  const [customDate, setCustomDate] = useState("");
  const [materialsDropped, setMaterialsDropped] = useState(true);
  const [packetRequested, setPacketRequested] = useState(false);
  const [referralProcessCaptured, setReferralProcessCaptured] = useState(false);
  const [decisionMakerMet, setDecisionMakerMet] = useState(false);
  const [referralPotential, setReferralPotential] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photoWarning, setPhotoWarning] = useState<string | null>(null);
  const [pendingPhotos, setPendingPhotos] = useState<PendingPhoto[]>([]);
  const [photoConfirmOpen, setPhotoConfirmOpen] = useState(false);
  const [photoAnalysis, setPhotoAnalysis] = useState<PhotoAnalysisDraft | null>(null);
  const [savedPhotoIds, setSavedPhotoIds] = useState<string[]>([]);
  const [savedActivityId, setSavedActivityId] = useState<string | null>(null);
  const [photoAiConfigured, setPhotoAiConfigured] = useState(true);
  const [photoConfirmSaving, setPhotoConfirmSaving] = useState(false);
  const [postSave, setPostSave] = useState<{
    activityId: string;
    outcome: string | null;
    packetRequested: boolean;
    notes: string;
  } | null>(null);
  const [completeCampaignStep, setCompleteCampaignStep] = useState(Boolean(campaignStepInstanceId));
  const [profilePrompt, setProfilePrompt] = useState<ReferralProfileUpdateFromActivityPrompt | null>(null);

  useEffect(() => {
    if (!open) return;
    setCompleteCampaignStep(Boolean(campaignStepInstanceId));
    setActivityType(defaultActivityType);
    setOutcome(defaultOutcome);
    setNotes(defaultNotes);
    setFollowUpPreset("none");
    setCustomDate("");
    setMaterialsDropped(defaultOutcome === "Left Materials" || defaultActivityType === "Packet Dropped");
    setPacketRequested(false);
    setReferralProcessCaptured(false);
    setDecisionMakerMet(defaultOutcome === "Met Decision Maker");
    setReferralPotential("");
    setError(null);
    setPhotoWarning(null);
    setPendingPhotos([]);
    setPhotoConfirmOpen(false);
    setPhotoAnalysis(null);
    setSavedPhotoIds([]);
    setSavedActivityId(null);
    setPostSave(null);
  }, [open, defaultActivityType, defaultOutcome, defaultNotes, facilityId]);

  useEffect(() => {
    if (outcome === "Left Materials") setMaterialsDropped(true);
    if (outcome === "Wants Packet Faxed") setPacketRequested(true);
    if (outcome === "Wants Email Info") setPacketRequested(true);
    if (outcome === "Met Decision Maker") setDecisionMakerMet(true);
  }, [outcome]);

  if (!open) return null;

  function finishOrPrompt(activityId: string, taskCreated: boolean) {
    const showPostSave =
      (isReferralLeadSuggestedOutcome(outcome) || shouldDefaultCreatePacketRequest(outcome, packetRequested)) &&
      activityId;
    if (showPostSave) {
      setPostSave({ activityId, outcome: outcome || null, packetRequested, notes: notes.trim() });
      if (taskCreated) {
        onSavedMessage?.("Activity saved and follow-up task created.");
      }
      return;
    }
    if (taskCreated) {
      onSavedMessage?.("Activity saved and follow-up task created.");
    } else {
      onActivitySaved?.(activityId);
      onSaved?.();
    }
    const savedNotes = notes.trim();
    if (referralProcessCaptured || /referral|fax.*intake|referral process/i.test(savedNotes)) {
      const hint = extractReferralProcessHintFromNotes(savedNotes);
      if (hint?.referral_process) {
        setProfilePrompt(hint);
        return;
      }
    }
    onClose();
  }

  async function saveOfflineDraft(payload: Record<string, unknown>, photoFiles: File[]) {
    const uid = userId ?? getOfflineQueueUserId();
    if (!uid) {
      setError("Could not save offline draft. Sign in again.");
      return false;
    }
    await enqueueOfflineItem({
      type: "quick_log",
      user_id: uid,
      payload,
      related_facility_id: facilityId,
      related_route_id: relatedRouteId ?? null,
      related_stop_id: relatedStopId ?? null,
      facility_name: facilityName,
      photo_files: photoFiles.length > 0 ? photoFiles : undefined,
    });
    onOfflineQueued?.();
    onSavedMessage?.("You appear offline. Quick Log saved to pending sync.");
    onClose();
    return true;
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const next_follow_up_at = followUpIsoFromPreset(
        followUpPreset,
        followUpPreset === "custom" ? customDate : undefined
      );

      if (followUpPreset === "custom" && !next_follow_up_at) {
        setError("Choose a valid follow-up date.");
        setSaving(false);
        return;
      }

      const body = {
        activity_type: activityType,
        outcome: outcome || null,
        notes: notes.trim() || null,
        next_follow_up_at,
        materials_dropped_off: materialsDropped,
        requested_packet: packetRequested,
        referral_process_captured: referralProcessCaptured,
        decision_maker_met: decisionMakerMet,
        referral_potential: referralPotential || null,
        campaign_step_instance_id: campaignStepInstanceId ?? null,
        complete_campaign_step: completeCampaignStep && Boolean(campaignStepInstanceId),
      };

      const photoFiles = pendingPhotoFiles(pendingPhotos);

      if (isOffline) {
        await saveOfflineDraft(body, photoFiles);
        return;
      }

      const res = await fetch(`/api/facilities/${facilityId}/quick-log`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as QuickLogResponse;
      if (!data.ok) {
        const msg =
          data.error === "forbidden"
            ? "You do not have permission to log activities."
            : data.error === "facility_not_found"
              ? "Facility not found."
              : data.error === "invalid_follow_up_date"
                ? "Invalid follow-up date."
                : data.error === "save_failed"
                  ? "Could not save activity. Try again."
                  : "Save failed.";
        setError(msg);
        return;
      }

      const activityId = String((data.activity as { id?: string }).id ?? "");

      if (photoFiles.length > 0 && activityId) {
        const workflow = await runFacilityPhotoPostSaveWorkflow({
          facilityId,
          activityId,
          photos: photoFiles,
          contextNote: notes.trim() || undefined,
          sourceContext: "quick_log",
          onPhotoWarning: (msg) => setPhotoWarning(msg),
        });

        if (workflow.showConfirm && workflow.analysis) {
          setSavedActivityId(activityId);
          setSavedPhotoIds(workflow.photoIds);
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

      finishOrPrompt(activityId, Boolean(data.task_created));
    } catch (err) {
      if (isNetworkError(err)) {
        const next_follow_up_at = followUpIsoFromPreset(
          followUpPreset,
          followUpPreset === "custom" ? customDate : undefined
        );
        const saved = await saveOfflineDraft(
          {
            activity_type: activityType,
            outcome: outcome || null,
            notes: notes.trim() || null,
            next_follow_up_at,
            materials_dropped_off: materialsDropped,
            requested_packet: packetRequested,
            referral_process_captured: referralProcessCaptured,
            decision_maker_met: decisionMakerMet,
            referral_potential: referralPotential || null,
            campaign_step_instance_id: campaignStepInstanceId ?? null,
            complete_campaign_step: completeCampaignStep && Boolean(campaignStepInstanceId),
          },
          pendingPhotoFiles(pendingPhotos)
        );
        if (!saved) setError("Network error. Check your connection and try again.");
      } else {
        setError("Network error. Check your connection and try again.");
      }
    } finally {
      setSaving(false);
    }
  }

  const followUpChips: { id: QuickLogFollowUpPreset; label: string }[] = [
    { id: "none", label: "None" },
    { id: "today", label: "Today" },
    { id: "tomorrow", label: "Tomorrow" },
    { id: "3days", label: "3 days" },
    { id: "1week", label: "1 week" },
    { id: "2weeks", label: "2 weeks" },
    { id: "custom", label: "Custom" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-log-title"
        className="relative z-10 flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl"
      >
        <div className="shrink-0 border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-700">Quick Log</p>
          <h2 id="quick-log-title" className="mt-1 text-lg font-semibold leading-snug text-slate-900">
            {facilityName}
          </h2>
          {postSave ? (
            <div className="mt-4">
              <FacilityPostActivityActions
                facilityId={facilityId}
                facilityName={facilityName}
                activityId={postSave.activityId}
                outcome={postSave.outcome}
                packetRequested={postSave.packetRequested}
                defaultNotes={postSave.notes}
                contacts={contacts}
                staffOptions={staffOptions}
                defaultRepId={defaultRepId}
                onDone={() => {
                  onSaved?.();
                  onClose();
                }}
                onToast={onSavedMessage}
              />
            </div>
          ) : null}
          {!postSave && onAdvancedLog ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                onAdvancedLog();
              }}
              className="mt-2 text-xs font-semibold text-sky-800 underline underline-offset-2"
            >
              Advanced Log
            </button>
          ) : null}
        </div>

        {!postSave ? (
        <>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="space-y-5">
            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                What happened?
              </legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {QUICK_LOG_ACTIVITY_CHIPS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setActivityType(c.value)}
                    className={activityType === c.value ? chipOn : chipOff}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">Outcome</legend>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {QUICK_LOG_OUTCOME_CHIPS.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setOutcome(c.value)}
                    className={outcome === c.value ? chipOn : chipOff}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500">
              Notes
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={`${textareaCls} min-h-[5.5rem]`}
                placeholder="Example: Left postcards with front desk. Maria handles referrals. Asked us to fax packet and follow up next week."
              />
            </label>

            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Next follow-up
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {followUpChips.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setFollowUpPreset(c.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      followUpPreset === c.id
                        ? "border-sky-600 bg-sky-600 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {followUpPreset === "custom" ? (
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              ) : null}
            </fieldset>

            <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={materialsDropped}
                  onChange={(e) => setMaterialsDropped(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Materials dropped
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={packetRequested}
                  onChange={(e) => setPacketRequested(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Packet requested
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={referralProcessCaptured}
                  onChange={(e) => setReferralProcessCaptured(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Referral process captured
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-800">
                <input
                  type="checkbox"
                  checked={decisionMakerMet}
                  onChange={(e) => setDecisionMakerMet(e.target.checked)}
                  className="rounded border-slate-300"
                />
                Decision maker met
              </label>
              {campaignStepInstanceId ? (
                <label className="flex items-center gap-2 rounded-lg border border-pink-200 bg-pink-50 px-3 py-2 text-sm font-semibold text-pink-950 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={completeCampaignStep}
                    onChange={(e) => setCompleteCampaignStep(e.target.checked)}
                    className="rounded border-pink-300"
                  />
                  Mark campaign step complete after save
                </label>
              ) : null}
            </div>

            <fieldset>
              <legend className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Referral potential (optional)
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                {QUICK_LOG_REFERRAL_POTENTIAL.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setReferralPotential(referralPotential === p ? "" : p)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                      referralPotential === p
                        ? "border-violet-600 bg-violet-600 text-white"
                        : "border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </fieldset>

            <FacilityPhotoPicker photos={pendingPhotos} onChange={setPendingPhotos} disabled={saving} />

            {photoWarning ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {photoWarning}
              </div>
            ) : null}

            {error ? (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}
          </div>
        </div>

        <div className="sticky bottom-0 flex shrink-0 gap-2 border-t border-slate-100 bg-white px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !activityType}
            onClick={() => void handleSave()}
            className="flex-[2] rounded-xl bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-50"
          >
            {saving ? "Saving…" : isOffline ? "Save Draft Offline" : "Save Activity"}
          </button>
        </div>
        </>
        ) : null}
      </div>

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
          if (!savedActivityId) {
            setPhotoConfirmOpen(false);
            onClose();
            return;
          }
          setPhotoConfirmSaving(true);
          void confirmFacilityPhotoActions({
            facilityId,
            activityId: savedActivityId,
            photoIds: savedPhotoIds,
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
          if (!savedActivityId) return;
          setPhotoConfirmSaving(true);
          void confirmFacilityPhotoActions({
            facilityId,
            activityId: savedActivityId,
            photoIds: savedPhotoIds,
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

      {profilePrompt ? (
        <FacilityReferralProfileUpdatePrompt
          facilityId={facilityId}
          facilityName={facilityName}
          suggestion={profilePrompt}
          onClose={() => {
            setProfilePrompt(null);
            onClose();
          }}
          onApplied={() => onSavedMessage?.("Referral profile updated.")}
        />
      ) : null}
    </div>
  );
}
