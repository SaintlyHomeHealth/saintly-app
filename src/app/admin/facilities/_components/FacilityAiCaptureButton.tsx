"use client";

import { useState } from "react";

import {
  FacilityAiCaptureModal,
  type FacilityAiCaptureSourceContext,
} from "@/app/admin/facilities/_components/FacilityAiCaptureModal";

type FacilityAiCaptureButtonProps = {
  facilityId?: string;
  facilityName?: string;
  defaultText?: string;
  currentLatitude?: number;
  currentLongitude?: number;
  sourceContext?: FacilityAiCaptureSourceContext;
  className?: string;
  children?: React.ReactNode;
  onSaved?: () => void;
  /** When true, button is disabled (e.g. external Google stop — Quick Add first). */
  disabled?: boolean;
  disabledTitle?: string;
  campaignStepInstanceId?: string;
};

export function FacilityAiCaptureButton({
  facilityId,
  facilityName,
  defaultText,
  currentLatitude,
  currentLongitude,
  sourceContext,
  className,
  children = "AI Capture",
  onSaved,
  disabled = false,
  disabledTitle = "Quick Add to portal before AI Capture",
  campaignStepInstanceId,
}: FacilityAiCaptureButtonProps) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
  }

  if (disabled) {
    return (
      <span
        className={`${className ?? ""} cursor-not-allowed opacity-50`}
        title={disabledTitle}
      >
        {children}
      </span>
    );
  }

  return (
    <>
      {toast ? (
        <div className="fixed left-1/2 top-4 z-[60] -translate-x-1/2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-lg">
          {toast}
        </div>
      ) : null}
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <FacilityAiCaptureModal
        open={open}
        facilityId={facilityId}
        facilityName={facilityName}
        defaultText={defaultText}
        currentLatitude={currentLatitude}
        currentLongitude={currentLongitude}
        sourceContext={sourceContext}
        campaignStepInstanceId={campaignStepInstanceId}
        onClose={() => setOpen(false)}
        onSaved={() => {
          showToast("Activity saved.");
          onSaved?.();
        }}
        onSavedMessage={(msg) => {
          showToast(msg);
          onSaved?.();
        }}
      />
    </>
  );
}
