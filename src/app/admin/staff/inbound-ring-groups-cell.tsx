import { INBOUND_RING_GROUP_KEYS, ringGroupKeyLabel } from "@/lib/phone/ring-groups";

import { updateInboundRingGroups } from "./actions";

type Props = {
  staffProfileId: string;
  userId: string | null;
  /** Enabled membership keys for this user (from DB). */
  selectedGroups: string[];
  primaryGroup: string | null;
};

const GROUP_DISPLAY_ORDER = ["intake", "admin", "billing", "on_call"] as const;

function sortKeysForDisplay(keys: string[]): string[] {
  return [...new Set(keys)].sort(
    (a, b) => GROUP_DISPLAY_ORDER.indexOf(a as (typeof GROUP_DISPLAY_ORDER)[number]) - GROUP_DISPLAY_ORDER.indexOf(b as (typeof GROUP_DISPLAY_ORDER)[number])
  );
}

export function InboundRingGroupsCell({ staffProfileId, userId, selectedGroups, primaryGroup }: Props) {
  if (!userId) {
    return (
      <p className="max-w-md text-xs leading-snug text-slate-600">
        <span className="font-semibold text-slate-800">Inbound ring groups</span> need a linked login (user id) in
        Supabase. Create a login for this person first, then return here to add them to groups.
      </p>
    );
  }

  const selected = new Set(selectedGroups);
  const sorted = sortKeysForDisplay(selectedGroups);
  const statusLine =
    sorted.length === 0
      ? "Not in group"
      : sorted.map((k) => ringGroupKeyLabel(k)).join(", ") +
        (primaryGroup ? ` · Primary: ${ringGroupKeyLabel(primaryGroup)}` : "");

  return (
    <div className="min-w-[210px] space-y-1.5">
      <p className="max-w-[220px] text-[10px] font-medium leading-snug text-slate-700">{statusLine}</p>
      <form action={updateInboundRingGroups} className="space-y-1.5 rounded-[12px] border border-violet-100/80 bg-violet-50/40 p-2">
        <input type="hidden" name="staffProfileId" value={staffProfileId} />
        <div className="flex flex-wrap gap-x-2 gap-y-1">
          {INBOUND_RING_GROUP_KEYS.map((key) => (
            <label key={key} className="inline-flex cursor-pointer items-center gap-1 text-[10px] text-slate-700">
              <input
                type="checkbox"
                name="groups"
                value={key}
                defaultChecked={selected.has(key)}
                className="rounded border-slate-300"
              />
              <span>{ringGroupKeyLabel(key)}</span>
            </label>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] font-semibold text-slate-500">Primary</span>
          <select
            name="primaryGroup"
            defaultValue={primaryGroup && selected.has(primaryGroup) ? primaryGroup : ""}
            className="max-w-[130px] rounded-[8px] border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-800"
          >
            <option value="">—</option>
            {INBOUND_RING_GROUP_KEYS.map((key) => (
              <option key={key} value={key}>
                {ringGroupKeyLabel(key)}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full border border-violet-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-violet-900 shadow-sm hover:bg-violet-100"
          >
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
