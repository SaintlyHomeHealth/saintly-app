"use client";

import { useState } from "react";

import { FacilityReferralLeadModal } from "@/app/admin/facilities/_components/FacilityReferralLeadModal";

type StaffOption = { user_id: string; label: string };
type ContactOption = { id: string; name: string };

type FacilityNewReferralButtonProps = {
  facilityId: string;
  facilityName: string;
  className?: string;
  children?: React.ReactNode;
  contacts?: ContactOption[];
  staffOptions?: StaffOption[];
  defaultRepId?: string | null;
  activityId?: string | null;
  onCreated?: () => void;
};

export function FacilityNewReferralButton({
  facilityId,
  facilityName,
  className,
  children = "New Referral",
  contacts = [],
  staffOptions = [],
  defaultRepId,
  activityId,
  onCreated,
}: FacilityNewReferralButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)}>
        {children}
      </button>
      <FacilityReferralLeadModal
        open={open}
        facilityId={facilityId}
        facilityName={facilityName}
        contacts={contacts}
        staffOptions={staffOptions}
        defaults={{ defaultRepId, activityId }}
        onClose={() => setOpen(false)}
        onCreated={() => onCreated?.()}
      />
    </>
  );
}
