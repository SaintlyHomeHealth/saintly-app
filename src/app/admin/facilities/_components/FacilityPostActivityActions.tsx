"use client";

import { useState } from "react";

import { FacilityCreateFollowUpTaskModal } from "@/app/admin/facilities/_components/FacilityCreateFollowUpTaskModal";
import { FacilityPacketRequestModal } from "@/app/admin/facilities/_components/FacilityPacketRequestModal";
import { FacilityReferralLeadModal } from "@/app/admin/facilities/_components/FacilityReferralLeadModal";
import {
  isReferralLeadPrimaryOutcome,
  isReferralLeadSuggestedOutcome,
  type FacilityReferralLeadModalDefaults,
} from "@/lib/crm/facility-referral-lead-client";
import {
  inferDeliveryMethodFromOutcome,
  shouldDefaultCreatePacketRequest,
} from "@/lib/crm/facility-packet-types";
import type { PacketDeliveryMethod } from "@/lib/crm/facility-packet-types";

type StaffOption = { user_id: string; label: string };
type ContactOption = { id: string; name: string };

type FacilityPostActivityActionsProps = {
  facilityId: string;
  facilityName: string;
  activityId: string;
  outcome: string | null;
  packetRequested?: boolean;
  defaultNotes?: string;
  contacts?: ContactOption[];
  staffOptions?: StaffOption[];
  defaultRepId?: string | null;
  referralDefaults?: FacilityReferralLeadModalDefaults;
  onDone: () => void;
  onToast?: (message: string) => void;
};

const btnPrimary =
  "inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-xl bg-gradient-to-r from-emerald-600 to-teal-500 px-4 py-2.5 text-sm font-semibold text-white shadow-sm";
const btnSecondary =
  "inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2.5 text-sm font-semibold text-sky-900";
const btnPacket =
  "inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-xl border border-violet-600 bg-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm";
const btnGhost =
  "inline-flex min-h-[2.75rem] flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800";

export function FacilityPostActivityActions({
  facilityId,
  facilityName,
  activityId,
  outcome,
  packetRequested = false,
  defaultNotes,
  contacts = [],
  staffOptions = [],
  defaultRepId,
  referralDefaults,
  onDone,
  onToast,
}: FacilityPostActivityActionsProps) {
  const [referralOpen, setReferralOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [packetOpen, setPacketOpen] = useState(
    shouldDefaultCreatePacketRequest(outcome, packetRequested)
  );

  const showReferral = isReferralLeadSuggestedOutcome(outcome);
  const referralPrimary = isReferralLeadPrimaryOutcome(outcome);
  const showPacket = shouldDefaultCreatePacketRequest(outcome, packetRequested);

  const defaults: FacilityReferralLeadModalDefaults = {
    ...referralDefaults,
    activityId,
    defaultRepId,
    originatingOutcome: outcome,
  };

  const deliveryMethod: PacketDeliveryMethod | null =
    inferDeliveryMethodFromOutcome(outcome) ?? (packetRequested ? "fax" : null);

  return (
    <>
      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-4">
        <p className="text-sm font-semibold text-emerald-900">Activity saved.</p>
        <p className="mt-1 text-xs text-emerald-800/90">What would you like to do next?</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          {showPacket ? (
            <button type="button" className={showPacket && !showReferral ? btnPacket : btnSecondary} onClick={() => setPacketOpen(true)}>
              Create Packet Request
            </button>
          ) : null}
          {showReferral ? (
            <button
              type="button"
              className={referralPrimary ? btnPrimary : btnSecondary}
              onClick={() => setReferralOpen(true)}
            >
              Create Referral Lead
            </button>
          ) : null}
          <button
            type="button"
            className={showReferral && !referralPrimary && !showPacket ? btnPrimary : btnSecondary}
            onClick={() => setFollowUpOpen(true)}
          >
            Create Follow-Up
          </button>
          <button type="button" className={btnGhost} onClick={onDone}>
            Done
          </button>
        </div>
      </div>

      <FacilityPacketRequestModal
        open={packetOpen}
        onClose={() => setPacketOpen(false)}
        facilityId={facilityId}
        facilityName={facilityName}
        activityId={activityId}
        contacts={contacts}
        staffOptions={staffOptions}
        defaultAssignedTo={defaultRepId}
        defaultDeliveryMethod={deliveryMethod}
        defaultNotes={defaultNotes}
        defaultOutcome={outcome}
        source="quick_log"
        onCreated={() => {
          onToast?.("Packet request created.");
          onDone();
        }}
      />

      <FacilityReferralLeadModal
        open={referralOpen}
        facilityId={facilityId}
        facilityName={facilityName}
        contacts={contacts}
        staffOptions={staffOptions}
        defaults={defaults}
        onClose={() => setReferralOpen(false)}
        onCreated={() => onDone()}
        onToast={onToast}
      />

      <FacilityCreateFollowUpTaskModal
        open={followUpOpen}
        facilityId={facilityId}
        facilityName={facilityName}
        contacts={contacts}
        staffOptions={staffOptions}
        defaultAssignedTo={defaultRepId}
        onClose={() => setFollowUpOpen(false)}
        onCreated={onDone}
        onToast={onToast}
      />
    </>
  );
}
