"use client";

import { useState } from "react";

import {
  FACILITY_PHOTO_TYPE_LABELS,
  type FacilityPhotoType,
} from "@/lib/crm/facility-photos-constants";

export type PhotoAnalysisDraft = {
  photo_type: FacilityPhotoType | string;
  summary: string;
  confidence: number;
  warnings: string[];
  suggested_actions: {
    materials_dropped_off: boolean;
    requested_packet: boolean;
    create_or_update_contact: boolean;
    contact_name: string | null;
    contact_role: string | null;
    contact_phone: string | null;
    contact_email: string | null;
    attach_to_activity: boolean;
    attach_to_facility: boolean;
    got_business_card: boolean;
  };
  possible_existing_contact_id: string | null;
  possible_existing_contact_name: string | null;
};

type FacilityPhotoAnalysisConfirmModalProps = {
  open: boolean;
  analysis: PhotoAnalysisDraft | null;
  aiConfigured: boolean;
  saving?: boolean;
  onClose: () => void;
  onConfirm: (opts: {
    applyActions: boolean;
    contactMode: "update_existing" | "create_new" | "skip";
  }) => void;
  onSavePhotoOnly: () => void;
  onEdit: () => void;
};

function photoTypeLabel(type: string): string {
  if (type in FACILITY_PHOTO_TYPE_LABELS) {
    return FACILITY_PHOTO_TYPE_LABELS[type as FacilityPhotoType];
  }
  return type.replace(/_/g, " ");
}

export function FacilityPhotoAnalysisConfirmModal({
  open,
  analysis,
  aiConfigured,
  saving = false,
  onClose,
  onConfirm,
  onSavePhotoOnly,
  onEdit,
}: FacilityPhotoAnalysisConfirmModalProps) {
  const [contactMode, setContactMode] = useState<"update_existing" | "create_new" | "skip">(
    "update_existing"
  );

  if (!open) return null;

  const hasContactSuggestion =
    analysis?.suggested_actions.create_or_update_contact && analysis.suggested_actions.contact_name;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="relative z-10 w-full max-w-md rounded-t-3xl border border-slate-200 bg-white shadow-xl sm:rounded-3xl"
      >
        <div className="border-b border-slate-100 px-5 py-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-violet-700">AI Photo Review</p>
          <h3 className="mt-1 text-lg font-semibold text-slate-900">Confirm photo actions</h3>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-5 py-4 text-sm text-slate-700">
          {!aiConfigured ? (
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
              AI photo review is not configured yet. Photo saved without AI summary.
            </p>
          ) : analysis ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">AI found</p>
                <p className="mt-1 font-semibold text-slate-900">
                  Photo type: {photoTypeLabel(analysis.photo_type)}
                </p>
                <p className="mt-1">{analysis.summary}</p>
                <p className="mt-2 text-xs text-slate-500">
                  Confidence: {Math.round(analysis.confidence * 100)}%
                </p>
              </div>

              {analysis.suggested_actions.materials_dropped_off ? (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-emerald-900">
                  Suggested: Mark materials dropped off
                </p>
              ) : null}
              {analysis.suggested_actions.requested_packet ? (
                <p className="rounded-lg bg-sky-50 px-3 py-2 text-sky-900">
                  Suggested: Mark packet/fax requested
                </p>
              ) : null}
              {hasContactSuggestion ? (
                <div className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-violet-950">
                  <p className="font-semibold">Suggested: Create/update contact</p>
                  <p className="mt-1">
                    {analysis.suggested_actions.contact_name}
                    {analysis.suggested_actions.contact_role
                      ? ` · ${analysis.suggested_actions.contact_role}`
                      : ""}
                  </p>
                  {analysis.possible_existing_contact_id ? (
                    <div className="mt-2 space-y-1">
                      <p className="text-xs font-semibold">Possible existing contact found.</p>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="radio"
                          name="contactMode"
                          checked={contactMode === "update_existing"}
                          onChange={() => setContactMode("update_existing")}
                        />
                        Update {analysis.possible_existing_contact_name ?? "existing contact"}
                      </label>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="radio"
                          name="contactMode"
                          checked={contactMode === "create_new"}
                          onChange={() => setContactMode("create_new")}
                        />
                        Create new contact
                      </label>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {analysis.warnings.map((w) => (
                <p key={w} className="text-xs text-amber-800">
                  {w}
                </p>
              ))}
            </div>
          ) : (
            <p>Photo uploaded. No AI analysis available.</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2 border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onEdit}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700"
          >
            Edit
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSavePhotoOnly}
            className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Save photo only
          </button>
          <button
            type="button"
            disabled={saving || !analysis}
            onClick={() =>
              onConfirm({
                applyActions: true,
                contactMode: hasContactSuggestion ? contactMode : "skip",
              })
            }
            className="w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-500 px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-50 sm:w-auto sm:flex-[2]"
          >
            {saving ? "Saving…" : "Confirm"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 sm:w-auto"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
