/**
 * Quick Log field workflow — chip labels and follow-up helpers.
 */

import { APP_TIME_ZONE } from "@/lib/datetime/app-timezone";

export const QUICK_LOG_ACTIVITY_CHIPS = [
  { label: "Drop-in", value: "Cold Drop-In" },
  { label: "In-Person Visit", value: "In-Person Visit" },
  { label: "Phone Call", value: "Phone Call" },
  { label: "Voicemail", value: "Voicemail" },
  { label: "Text", value: "Text" },
  { label: "Email", value: "Email" },
  { label: "Fax", value: "Fax Drop" },
  { label: "Packet Dropped", value: "Packet Dropped" },
  { label: "Referral Received", value: "Referral Received" },
  { label: "Follow-Up Needed", value: "Follow-Up Visit" },
  { label: "Other", value: "Other" },
] as const;

export const QUICK_LOG_OUTCOME_CHIPS = [
  { label: "No answer", value: "No Answer" },
  { label: "Front desk only", value: "Front Desk Only" },
  { label: "Left materials", value: "Left Materials" },
  { label: "Good conversation", value: "Good Conversation" },
  { label: "Met decision maker", value: "Met Decision Maker" },
  { label: "Wants packet faxed", value: "Wants Packet Faxed" },
  { label: "Wants email info", value: "Wants Email Info" },
  { label: "Asked to follow up", value: "Asked to Follow Up" },
  { label: "Referral sent", value: "Referral Sent" },
  { label: "Not interested", value: "Not Interested" },
  { label: "Already has agency", value: "Already Have Agency" },
  { label: "Future opportunity", value: "Future Opportunity" },
] as const;

export const QUICK_LOG_REFERRAL_POTENTIAL = ["Cold", "Warm", "Hot", "Not interested"] as const;

export type QuickLogFollowUpPreset =
  | "none"
  | "today"
  | "tomorrow"
  | "3days"
  | "1week"
  | "2weeks"
  | "custom";

/** Activity types that represent an in-person field touch (for last_visit semantics). */
export const IN_PERSON_QUICK_LOG_ACTIVITY_TYPES = new Set([
  "Cold Drop-In",
  "In-Person Visit",
  "Packet Dropped",
  "Follow-Up Visit",
  "Lunch / In-Service",
  "Scheduled Meeting",
]);

const ALLOWED_QUICK_LOG_ACTIVITY = new Set<string>(
  QUICK_LOG_ACTIVITY_CHIPS.map((c) => c.value)
);

const ALLOWED_QUICK_LOG_OUTCOMES = new Set<string>(
  QUICK_LOG_OUTCOME_CHIPS.map((c) => c.value)
);

export function isAllowedQuickLogActivityType(value: string): boolean {
  return ALLOWED_QUICK_LOG_ACTIVITY.has(value);
}

export function isAllowedQuickLogOutcome(value: string): boolean {
  return ALLOWED_QUICK_LOG_OUTCOMES.has(value);
}

function phoenixDateParts(date: Date): { y: number; m: number; d: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year")?.value ?? "0");
  const m = Number(parts.find((p) => p.type === "month")?.value ?? "0");
  const d = Number(parts.find((p) => p.type === "day")?.value ?? "0");
  return { y, m, d };
}

function addDaysPhoenix(base: Date, days: number): string {
  const { y, m, d } = phoenixDateParts(base);
  const utc = Date.UTC(y, m - 1, d + days, 17, 0, 0);
  return new Date(utc).toISOString();
}

/** End-of-business-day style follow-up instants in agency timezone. */
export function followUpIsoFromPreset(preset: QuickLogFollowUpPreset, customDate?: string): string | null {
  if (preset === "none") return null;
  if (preset === "custom") {
    if (!customDate || !/^\d{4}-\d{2}-\d{2}$/.test(customDate)) return null;
    const [y, m, d] = customDate.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 17, 0, 0)).toISOString();
  }
  const now = new Date();
  switch (preset) {
    case "today":
      return addDaysPhoenix(now, 0);
    case "tomorrow":
      return addDaysPhoenix(now, 1);
    case "3days":
      return addDaysPhoenix(now, 3);
    case "1week":
      return addDaysPhoenix(now, 7);
    case "2weeks":
      return addDaysPhoenix(now, 14);
    default:
      return null;
  }
}

export const QUICK_LOG_DEFAULT_ACTIVITY = "Cold Drop-In";
export const QUICK_LOG_DEFAULT_OUTCOME = "Left Materials";
