import Link from "next/link";

type FacilityBeforeWalkInCardProps = {
  facilityId: string;
  facilityName: string;
  bullets: string[];
  compact?: boolean;
};

export function FacilityBeforeWalkInCard({
  facilityId,
  facilityName,
  bullets,
  compact = false,
}: FacilityBeforeWalkInCardProps) {
  if (!bullets.length) return null;

  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50/70 ${compact ? "p-3" : "p-4"}`}
    >
      <p className="text-[10px] font-bold uppercase tracking-wide text-amber-900">Before you walk in</p>
      {!compact ? (
        <p className="mt-0.5 text-xs font-semibold text-amber-950">{facilityName}</p>
      ) : null}
      <ul className="mt-2 space-y-1">
        {bullets.map((b) => (
          <li key={b} className="text-sm text-amber-950">
            · {b}
          </li>
        ))}
      </ul>
      <Link
        href={`/admin/facilities/${facilityId}`}
        className="mt-2 inline-block text-xs font-semibold text-amber-900 underline"
      >
        Full profile
      </Link>
    </div>
  );
}
