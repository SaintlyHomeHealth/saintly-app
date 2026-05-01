"use client";

import { type ReactNode, useState } from "react";

export type TwilioInventoryOption = {
  id: string;
  phone_number: string;
  label: string | null;
  status: string;
};

export function PhoneAssignmentModeFields(props: {
  initialMode: string;
  dedicatedInventoryCurrentId: string | null;
  twilioInventory: TwilioInventoryOption[];
  sharedSection: ReactNode;
  dedicatedExtraSection: ReactNode;
}) {
  const [mode, setMode] = useState(props.initialMode);
  const showShared = mode === "shared" || mode === "dedicated_and_shared";
  const showDedicated = mode === "dedicated" || mode === "dedicated_and_shared";

  return (
    <div className="space-y-3">
      <label className="block text-xs font-semibold text-slate-700">
        Number assignment
        <select
          name="phoneAssignmentMode"
          value={mode}
          onChange={(e) => setMode(e.target.value)}
          className="mt-1 w-full rounded-[12px] border border-slate-200 bg-white px-2 py-1.5 text-sm"
        >
          <option value="organization_default">Organization default / no dedicated number</option>
          <option value="shared">Shared company line</option>
          <option value="dedicated">Dedicated staff number</option>
          <option value="dedicated_and_shared">Dedicated staff number + shared company line</option>
        </select>
      </label>

      <div className={showShared ? "space-y-2 rounded-[12px] border border-amber-100 bg-amber-50/40 p-3" : "hidden"}>
        {props.sharedSection}
      </div>

      <div className={showDedicated ? "space-y-2 rounded-[12px] border border-sky-100 bg-sky-50/35 p-3" : "hidden"}>
        <label className="block text-xs font-semibold text-slate-700">
          Twilio inventory number
          <select
            key={props.dedicatedInventoryCurrentId ?? "none"}
            name="inventoryTwilioPhoneNumberId"
            defaultValue={props.dedicatedInventoryCurrentId ?? ""}
            className="mt-1 w-full rounded-[12px] border border-slate-200 bg-white px-2 py-1.5 font-mono text-sm"
          >
            <option value="">No change (assign or reassign in Admin → Phone Numbers)</option>
            {props.twilioInventory.map((r) => (
              <option key={r.id} value={r.id}>
                {r.phone_number}
                {r.label ? ` — ${r.label}` : ""}
                {r.status === "assigned" ? " (assigned to this staff)" : ""}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] leading-relaxed text-slate-700">
          Dedicated staff users only see calls and texts tied to their assigned user record (enforced on the
          server).
        </p>
        {props.dedicatedExtraSection}
      </div>
    </div>
  );
}
