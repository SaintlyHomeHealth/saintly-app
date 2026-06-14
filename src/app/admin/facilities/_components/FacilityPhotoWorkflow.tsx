"use client";

import { useState } from "react";

import {
  FacilityPhotoAnalysisConfirmModal,
  type PhotoAnalysisDraft,
} from "@/app/admin/facilities/_components/FacilityPhotoAnalysisConfirmModal";
import {
  FacilityPhotoPicker,
  pendingPhotoFiles,
  type PendingPhoto,
} from "@/app/admin/facilities/_components/FacilityPhotoPicker";
import {
  facilityPhotoFileUrl,
  uploadFacilityPhotoFiles,
} from "@/lib/crm/facility-photo-client";
import {
  enqueueOfflineItem,
  getOfflineQueueUserId,
  isNetworkError,
} from "@/lib/crm/facility-offline-queue";
import { useFacilityOnlineStatus } from "@/app/admin/facilities/_components/useFacilityOnlineStatus";

export type { PhotoAnalysisDraft } from "@/app/admin/facilities/_components/FacilityPhotoAnalysisConfirmModal";

export type FacilityPhotoWorkflowSource =
  | "quick_log"
  | "ai_capture"
  | "facility_detail"
  | "route_builder"
  | "finder";

/** After activity save: upload photos, optional AI analyze, show confirm modal. */
export async function runFacilityPhotoPostSaveWorkflow(input: {
  facilityId: string;
  activityId: string;
  photos: File[];
  contextNote?: string;
  sourceContext: FacilityPhotoWorkflowSource;
  onPhotoWarning?: (msg: string) => void;
  onComplete?: () => void;
}): Promise<{
  showConfirm: boolean;
  analysis: PhotoAnalysisDraft | null;
  photoIds: string[];
  aiConfigured: boolean;
}> {
  if (input.photos.length === 0) {
    return { showConfirm: false, analysis: null, photoIds: [], aiConfigured: true };
  }

  const uploaded = await uploadFacilityPhotoFiles({
    facilityId: input.facilityId,
    activityId: input.activityId,
    files: input.photos,
  });

  if (!uploaded.ok) {
    input.onPhotoWarning?.("Activity saved, but photo upload failed.");
    input.onComplete?.();
    return { showConfirm: false, analysis: null, photoIds: [], aiConfigured: true };
  }

  const photoIds = uploaded.photos.map((p) => p.id);

  const analyzeRes = await fetch("/api/facilities/photos/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      facility_id: input.facilityId,
      activity_id: input.activityId,
      photo_ids: photoIds,
      context_note: input.contextNote ?? null,
      source_context: input.sourceContext,
    }),
  });

  const analyzeData = (await analyzeRes.json()) as {
    ok: boolean;
    error?: string;
    analysis?: PhotoAnalysisDraft;
  };

  if (!analyzeData.ok) {
    if (analyzeData.error === "ai_not_configured") {
      input.onPhotoWarning?.(
        "AI photo review is not configured yet. Photo saved without AI summary."
      );
      input.onComplete?.();
      return { showConfirm: false, analysis: null, photoIds, aiConfigured: false };
    }
    input.onComplete?.();
    return { showConfirm: false, analysis: null, photoIds, aiConfigured: true };
  }

  return {
    showConfirm: true,
    analysis: analyzeData.analysis ?? null,
    photoIds,
    aiConfigured: true,
  };
}

export async function confirmFacilityPhotoActions(input: {
  facilityId: string;
  activityId: string;
  photoIds: string[];
  analysis: PhotoAnalysisDraft | null;
  applyActions: boolean;
  contactMode: "update_existing" | "create_new" | "skip";
}): Promise<boolean> {
  const res = await fetch("/api/facilities/photos/confirm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      facility_id: input.facilityId,
      activity_id: input.activityId,
      photo_ids: input.photoIds,
      photo_type: input.analysis?.photo_type ?? null,
      ai_summary: input.analysis?.summary ?? null,
      ai_extracted_json: input.analysis ?? null,
      apply_suggested_actions: input.applyActions,
      suggested_actions: input.analysis?.suggested_actions ?? null,
      contact_mode: input.contactMode,
      existing_contact_id: input.analysis?.possible_existing_contact_id ?? null,
    }),
  });
  const data = (await res.json()) as { ok: boolean };
  return data.ok;
}

type FacilityPhotoUploadModalProps = {
  open: boolean;
  facilityId: string;
  facilityName: string;
  sourceContext?: FacilityPhotoWorkflowSource;
  onClose: () => void;
  onSaved?: () => void;
  userId?: string;
  relatedRouteId?: string | null;
  relatedStopId?: string | null;
  contextNote?: string;
  onOfflineQueued?: () => void;
};

export function FacilityPhotoUploadModal({
  open,
  facilityId,
  facilityName,
  sourceContext = "facility_detail",
  onClose,
  onSaved,
  userId,
  relatedRouteId,
  relatedStopId,
  contextNote,
  onOfflineQueued,
}: FacilityPhotoUploadModalProps) {
  const { isOffline } = useFacilityOnlineStatus();
  const [photos, setPhotos] = useState<PendingPhoto[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [analysis, setAnalysis] = useState<PhotoAnalysisDraft | null>(null);
  const [photoIds, setPhotoIds] = useState<string[]>([]);
  const [activityId, setActivityId] = useState<string | null>(null);
  const [aiConfigured, setAiConfigured] = useState(true);
  const [confirmSaving, setConfirmSaving] = useState(false);

  if (!open) return null;

  async function handleUploadOnly() {
    setUploading(true);
    setError(null);
    try {
      const files = pendingPhotoFiles(photos);
      if (files.length === 0) {
        setError("Add at least one photo.");
        return;
      }

      if (isOffline) {
        const uid = userId ?? getOfflineQueueUserId();
        if (!uid) {
          setError("Could not save offline. Sign in again.");
          return;
        }
        await enqueueOfflineItem({
          type: "photo_note",
          user_id: uid,
          payload: {
            facility_id: facilityId,
            context_note: contextNote ?? null,
            source_context: sourceContext,
          },
          related_facility_id: facilityId,
          related_route_id: relatedRouteId ?? null,
          related_stop_id: relatedStopId ?? null,
          facility_name: facilityName,
          photo_files: files,
        });
        onOfflineQueued?.();
        onClose();
        return;
      }

      const uploaded = await uploadFacilityPhotoFiles({ facilityId, files });
      if (!uploaded.ok) {
        setError(
          uploaded.error === "file_too_large"
            ? "Photo is too large (max 10 MB)."
            : uploaded.error === "invalid_type"
              ? "Unsupported file type."
              : "Upload failed. Try again."
        );
        return;
      }

      const ids = uploaded.photos.map((p) => p.id);
      setPhotoIds(ids);

      const analyzeRes = await fetch("/api/facilities/photos/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facility_id: facilityId,
          photo_ids: ids,
          source_context: sourceContext,
        }),
      });
      const analyzeData = (await analyzeRes.json()) as {
        ok: boolean;
        error?: string;
        analysis?: PhotoAnalysisDraft;
      };

      if (!analyzeData.ok) {
        if (analyzeData.error === "ai_not_configured") {
          setAiConfigured(false);
          setAnalysis(null);
          setConfirmOpen(true);
          return;
        }
        onSaved?.();
        onClose();
        return;
      }

      setAiConfigured(true);
      setAnalysis(analyzeData.analysis ?? null);
      setConfirmOpen(true);
    } catch (err) {
      if (isNetworkError(err)) {
        const uid = userId ?? getOfflineQueueUserId();
        const files = pendingPhotoFiles(photos);
        if (uid && files.length > 0) {
          await enqueueOfflineItem({
            type: "photo_note",
            user_id: uid,
            payload: {
              facility_id: facilityId,
              context_note: contextNote ?? null,
              source_context: sourceContext,
            },
            related_facility_id: facilityId,
            related_route_id: relatedRouteId ?? null,
            related_stop_id: relatedStopId ?? null,
            facility_name: facilityName,
            photo_files: files,
          });
          onOfflineQueued?.();
          onClose();
          return;
        }
        setError("Upload failed. Check your connection.");
      }
    } finally {
      setUploading(false);
    }
  }

  async function finishConfirm(applyActions: boolean, contactMode: "update_existing" | "create_new" | "skip") {
    setConfirmSaving(true);
    await confirmFacilityPhotoActions({
      facilityId,
      activityId: activityId ?? "",
      photoIds,
      analysis,
      applyActions,
      contactMode,
    });
    setConfirmSaving(false);
    setConfirmOpen(false);
    onSaved?.();
    onClose();
  }

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
        <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
        <div className="relative z-10 flex max-h-[94vh] w-full max-w-lg flex-col rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl">
          <div className="shrink-0 border-b border-slate-100 px-5 py-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">Photo Note</p>
            <h2 className="mt-1 text-lg font-semibold text-slate-900">{facilityName}</h2>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <FacilityPhotoPicker photos={photos} onChange={setPhotos} />
            {error ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}
          </div>
          <div className="sticky bottom-0 flex gap-2 border-t border-slate-100 px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={uploading || photos.length === 0}
              onClick={() => void handleUploadOnly()}
              className="flex-[2] rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {uploading ? "Uploading…" : isOffline ? "Save Draft Offline" : "Upload & Review"}
            </button>
          </div>
        </div>
      </div>

      <FacilityPhotoAnalysisConfirmModal
        open={confirmOpen}
        analysis={analysis}
        aiConfigured={aiConfigured}
        saving={confirmSaving}
        onClose={() => {
          setConfirmOpen(false);
          onSaved?.();
          onClose();
        }}
        onEdit={() => setConfirmOpen(false)}
        onSavePhotoOnly={() => void finishConfirm(false, "skip")}
        onConfirm={({ applyActions, contactMode }) => void finishConfirm(applyActions, contactMode)}
      />
    </>
  );
}

export { facilityPhotoFileUrl };
