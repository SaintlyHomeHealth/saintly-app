import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { isPhoenixSameCalendarDay, phoenixTodayYmd } from "@/lib/recruiting/phoenix-time";

/** Activity rows that count as an outreach attempt on the recruiting list. */
export function isRecruitingOutreachAttemptActivity(input: {
  activity_type: string;
  outcome: string | null;
}): boolean {
  const type = (input.activity_type ?? "").trim();
  const outcome = (input.outcome ?? "").trim();
  if (type === "call" || type === "voicemail" || type === "text" || type === "email") return true;
  if (type === "status_change" && outcome === "no_response") return true;
  return false;
}

export type RecruitingLeadListEngagementSummary = {
  attemptsCount: number;
  lastContactAt: string | null;
  lastCallAt: string | null;
  lastTextAt: string | null;
  lastEmailAt: string | null;
  nextFollowUpAt: string | null;
  status: string;
  interestLevel: string | null;
  /** True when candidate CRM fields are the engagement source of truth. */
  usesCandidateEngagement: boolean;
};

export type RecruitingLeadListEngagementCandidateRow = {
  id: string;
  status: string | null;
  interest_level: string | null;
  last_call_at: string | null;
  last_text_at: string | null;
  last_contact_at: string | null;
  next_follow_up_at: string | null;
};

export function formatRecruitingListContactLine(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  if (isPhoenixSameCalendarDay(iso)) {
    return `Today, ${formatAppDateTime(iso, "—", { hour: "numeric", minute: "2-digit" })}`;
  }
  const contactYmd = phoenixYmdFromIso(iso);
  const yesterday = phoenixYmdOffset(-1);
  if (contactYmd === yesterday) {
    return `Yesterday, ${formatAppDateTime(iso, "—", { hour: "numeric", minute: "2-digit" })}`;
  }
  return formatAppDateTime(iso, "—", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatRecruitingListFollowUpLine(iso: string | null | undefined): string {
  if (!iso?.trim()) return "—";
  if (isPhoenixSameCalendarDay(iso)) return "Today";
  const followYmd = phoenixYmdFromIso(iso);
  const tomorrow = phoenixYmdOffset(1);
  if (followYmd === tomorrow) return "Tomorrow";
  return formatAppDateTime(iso, "—", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function phoenixYmdFromIso(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(t));
  const y = parts.find((p) => p.type === "year")?.value ?? "1970";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  const d = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${y}-${m}-${d}`;
}

function phoenixYmdOffset(dayDelta: number): string {
  const [y, m, d] = phoenixTodayYmd().split("-").map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d! + dayDelta, 12));
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(dt);
  const yy = parts.find((p) => p.type === "year")?.value ?? "1970";
  const mm = parts.find((p) => p.type === "month")?.value ?? "01";
  const dd = parts.find((p) => p.type === "day")?.value ?? "01";
  return `${yy}-${mm}-${dd}`;
}
