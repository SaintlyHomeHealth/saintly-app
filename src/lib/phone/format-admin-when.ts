import { APP_TIME_ZONE } from "@/lib/datetime/app-timezone";

/** Fixed IANA zone so SSR and browser match for admin / workspace phone UI. */
export const ADMIN_PHONE_DISPLAY_TIMEZONE = APP_TIME_ZONE;

/**
 * Same wall-clock instant everywhere: assemble from `formatToParts` so we never depend on
 * `Intl.DateTimeFormat#format()` string shape (differs Node vs browser for the same options).
 */
export function formatAdminPhoneWhen(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ADMIN_PHONE_DISPLAY_TIMEZONE,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(d);

  const pick = (type: Intl.DateTimeFormatPart["type"]) =>
    parts.find((p) => p.type === type)?.value ?? "";

  const month = pick("month");
  const day = pick("day");
  const year = pick("year");
  const hour = pick("hour");
  const minute = pick("minute");
  const dayPeriod = pick("dayPeriod");

  const timePart =
    hour && minute
      ? `${hour}:${minute}${dayPeriod ? ` ${dayPeriod}` : ""}`
      : "—";

  if (month && day && year) {
    return `${month} ${day}, ${year} · ${timePart}`;
  }
  return `${iso}`;
}
