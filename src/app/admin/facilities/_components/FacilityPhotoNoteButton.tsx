"use client";

import { useState } from "react";

import { FacilityPhotoUploadModal } from "@/app/admin/facilities/_components/FacilityPhotoWorkflow";
import type { FacilityPhotoWorkflowSource } from "@/app/admin/facilities/_components/FacilityPhotoWorkflow";

type FacilityPhotoNoteButtonProps = {
  facilityId?: string;
  facilityName?: string;
  sourceContext?: FacilityPhotoWorkflowSource;
  className?: string;
  children?: React.ReactNode;
  onSaved?: () => void;
  disabled?: boolean;
  disabledTitle?: string;
};

export function FacilityPhotoNoteButton({
  facilityId,
  facilityName,
  sourceContext = "facility_detail",
  className,
  children = "Photo Note",
  onSaved,
  disabled = false,
  disabledTitle = "Quick Add to portal before uploading photos",
}: FacilityPhotoNoteButtonProps) {
  const [open, setOpen] = useState(false);

  if (disabled) {
    return (
      <span className={`${className ?? ""} cursor-not-allowed opacity-50`} title={disabledTitle}>
        {children}
      </span>
    );
  }

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <FacilityPhotoUploadModal
        open={open}
        facilityId={facilityId ?? ""}
        facilityName={facilityName ?? "Facility"}
        sourceContext={sourceContext}
        onClose={() => setOpen(false)}
        onSaved={onSaved}
      />
    </>
  );
}
