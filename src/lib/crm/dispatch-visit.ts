import { APP_TIME_ZONE } from "@/lib/datetime/app-timezone";

/**
 * Shared dispatch visit display + day overlap (America/Phoenix agency time).
 */

export function visitOverlapsLocalDay(
  scheduledFor: string | null,
  scheduledEndAt: string | null,
  dayStart: Date,
  dayEnd: Date
): boolean {
  if (!scheduledFor) return false;
  const startMs = new Date(scheduledFor).getTime();
  const endMs = new Date(scheduledEndAt ?? scheduledFor).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) return false;
  const ds = dayStart.getTime();
  const de = dayEnd.getTime();
  return startMs < de && endMs >= ds;
}

const US_TIME: Intl.DateTimeFormatOptions = {
  timeZone: APP_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
};

const US_DATE_NO_YEAR: Intl.DateTimeFormatOptions = {
  timeZone: APP_TIME_ZONE,
  month: "short",
  day: "numeric",
};

function formatDispatchClock(d: Date): string {
  return new Intl.DateTimeFormat("en-US", US_TIME).format(d);
}

/** "HH:mm" / "H:mm" → "9:00 AM" (for window labels saved as 24h strings). */
export function formatHmToAmPm(hm: string): string {
  const m = hm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return hm.trim();
  const h = Number.parseInt(m[1], 10);
  const min = Number.parseInt(m[2], 10);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return hm.trim();
  const pad = (n: number) => (n < 10 ? `0${n}` : String(n));
  const epoch = Date.parse(`2000-01-01T${pad(h)}:${pad(min)}:00-07:00`);
  if (!Number.isFinite(epoch)) return hm.trim();
  return formatDispatchClock(new Date(epoch));
}

/** Custom window label in 12-hour form, e.g. "9:00 AM–11:45 PM". */
export function formatHmRangeToAmPm(startHm: string, endHm: string): string {
  return `${formatHmToAmPm(startHm)}–${formatHmToAmPm(endHm)}`;
}

/**
 * User-facing schedule line: always 12-hour AM/PM in en-US (not server locale).
 * Prefers ISO start/end when present so windows match dispatch buckets and SMS copy.
 */
export function formatDispatchScheduleLine(
  scheduledFor: string | null,
  scheduledEndAt: string | null,
  timeWindowLabel: string | null
): string {
  if (!scheduledFor || scheduledFor.trim() === "") {
    return timeWindowLabel?.trim() || "Unscheduled";
  }
  const s = new Date(scheduledFor);
  if (Number.isNaN(s.getTime())) {
    return timeWindowLabel?.trim() || "—";
  }
  const end = scheduledEndAt ? new Date(scheduledEndAt) : null;
  const hasDistinctEnd =
    end != null && !Number.isNaN(end.getTime()) && end.getTime() > s.getTime();

  const datePart = new Intl.DateTimeFormat("en-US", US_DATE_NO_YEAR).format(s);

  if (hasDistinctEnd && end) {
    return `${datePart}, ${formatDispatchClock(s)}–${formatDispatchClock(end)}`;
  }
  return `${datePart}, ${formatDispatchClock(s)}`;
}

export type ContactSnapshotInput = {
  primary_phone?: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function buildVisitSnapshotsFromContact(contact: ContactSnapshotInput | null): {
  patient_phone_snapshot: string | null;
  address_snapshot: string | null;
} {
  if (!contact) {
    return { patient_phone_snapshot: null, address_snapshot: null };
  }
  const phone = (contact.primary_phone ?? "").replace(/\D/g, "");
  const patient_phone_snapshot = phone.length >= 10 ? phone : (contact.primary_phone ?? "").trim() || null;
  const line1 = (contact.address_line_1 ?? "").trim();
  const line2 = (contact.address_line_2 ?? "").trim();
  const city = (contact.city ?? "").trim();
  const state = (contact.state ?? "").trim();
  const zip = (contact.zip ?? "").trim();
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const address_snapshot = [line1, line2, cityLine].filter(Boolean).join(", ") || null;
  return { patient_phone_snapshot, address_snapshot };
}
