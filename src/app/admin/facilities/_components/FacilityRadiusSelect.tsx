"use client";

import {
  FACILITY_RADIUS_OPTIONS,
  type FacilityRadiusOption,
} from "@/lib/crm/facility-location-search";

const selectCls =
  "rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-800 shadow-sm";

export type FacilityRadiusValue = FacilityRadiusOption | "all";

type Props = {
  value: FacilityRadiusValue;
  onChange: (value: FacilityRadiusValue) => void;
  className?: string;
};

export function FacilityRadiusSelect({ value, onChange, className }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value === "all" ? "all" : (Number(e.target.value) as FacilityRadiusOption))}
      className={className ?? selectCls}
      aria-label="Search radius"
    >
      {FACILITY_RADIUS_OPTIONS.map((mi) => (
        <option key={mi} value={mi}>
          {mi} mi
        </option>
      ))}
      <option value="all">All</option>
    </select>
  );
}

export function radiusValueToMiles(value: FacilityRadiusValue): number | null {
  return value === "all" ? null : value;
}
