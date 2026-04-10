import {
  facilityDueBadgeClasses,
  facilityDueBadgeLabel,
  type FacilityDueBand,
} from "@/lib/crm/facility-territory-due";

export function FacilityDueBadge({ band }: { band: FacilityDueBand }) {
  return (
    <span
      className={`inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-tight ${facilityDueBadgeClasses(band)}`}
    >
      {facilityDueBadgeLabel(band)}
    </span>
  );
}
