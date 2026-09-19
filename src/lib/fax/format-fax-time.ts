import { APP_TIME_ZONE } from "@/lib/datetime/app-timezone";

/** Arizona — no DST; display matches Saintly office local time. */
export const FAX_DISPLAY_TIMEZONE = APP_TIME_ZONE;

const listFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: FAX_DISPLAY_TIMEZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

/** Explicit fields — `dateStyle`/`timeStyle` cannot be combined with `timeZoneName` in V8. */
const detailFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: FAX_DISPLAY_TIMEZONE,
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZoneName: "short",
});

function safeInstant(value: string | null | undefined): Date | null {
  if (value == null || String(value).trim() === "") return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Fax Center table column — compact time in Phoenix with zone abbreviation. */
export function formatFaxDateTimeList(value: string | null | undefined): string {
  const d = safeInstant(value);
  if (!d) return "—";
  return listFormatter.format(d);
}

/** Fax detail header, metadata fields, and audit timeline — full date/time in Phoenix. */
export function formatFaxDateTimeDetail(value: string | null | undefined): string {
  const d = safeInstant(value);
  if (!d) return "—";
  return detailFormatter.format(d);
}

/** Relative time for inbox rows; pair with `formatFaxDateTimeDetail` on hover. */
export function formatFaxRelativeTime(value: string | null | undefined, nowMs: number = Date.now()): string {
  const d = safeInstant(value);
  if (!d) return "—";
  const delta = nowMs - d.getTime();
  const abs = Math.abs(delta);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (abs < minute) return "just now";
  if (abs < hour) {
    const n = Math.round(abs / minute);
    return `${n}m ago`;
  }
  if (abs < day) {
    const n = Math.round(abs / hour);
    return `${n}h ago`;
  }
  if (abs < 7 * day) {
    const n = Math.round(abs / day);
    return `${n}d ago`;
  }
  return formatFaxDateTimeList(value);
}
