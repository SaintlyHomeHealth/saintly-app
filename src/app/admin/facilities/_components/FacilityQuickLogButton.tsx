"use client";

import { useState } from "react";

import { FacilityQuickLogModal } from "@/app/admin/facilities/_components/FacilityQuickLogModal";

type FacilityQuickLogButtonProps = {
  facilityId: string;
  facilityName: string;
  className?: string;
  children?: React.ReactNode;
  defaultActivityType?: string;
  defaultOutcome?: string;
  defaultNotes?: string;
  campaignStepInstanceId?: string;
  onSaved?: () => void;
  onSavedMessage?: (message: string) => void;
  onAdvancedLog?: () => void;
};

export function FacilityQuickLogButton({
  facilityId,
  facilityName,
  className,
  children = "Quick Log",
  defaultActivityType,
  defaultOutcome,
  defaultNotes,
  campaignStepInstanceId,
  onSaved,
  onSavedMessage,
  onAdvancedLog,
}: FacilityQuickLogButtonProps) {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(null), 3000);
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
      <FacilityQuickLogModal
        facilityId={facilityId}
        facilityName={facilityName}
        defaultActivityType={defaultActivityType}
        defaultOutcome={defaultOutcome}
        defaultNotes={defaultNotes}
        campaignStepInstanceId={campaignStepInstanceId}
        open={open}
        onClose={() => setOpen(false)}
        onSaved={() => {
          showToast("Activity saved.");
          onSaved?.();
        }}
        onSavedMessage={(msg) => {
          showToast(msg);
          onSaved?.();
        }}
        onAdvancedLog={
          onAdvancedLog ??
          (() => {
            window.location.href = `/admin/facilities/${facilityId}?advanced=1`;
          })
        }
      />
    </>
  );
}
