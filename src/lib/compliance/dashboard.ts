import type { NaItemKey } from "@/lib/compliance/constants";
import { compareYmd, quarterBounds, quarterRangeIso } from "@/lib/compliance/period";
import {
  checklistStatus,
  rollupQuarter,
  type ChecklistStatus,
  type QuarterRollup,
} from "@/lib/compliance/status";
import type { YearSummary } from "@/lib/compliance/types";

export type QuarterSnapshot = {
  meetings: ChecklistStatus;
  meetingCount: number;
  finalizedMeetings: number;
  safety: ChecklistStatus;
  emergencyReview: ChecklistStatus;
  drill: ChecklistStatus;
  finalizedDrills: number;
  qapi: ChecklistStatus;
  onCallCount: number;
  onCallReady: boolean;
  incidentCount: number;
  project: { id: string; name: string; status: string } | null;
  rollup: QuarterRollup;
  na: Partial<Record<NaItemKey, boolean>>;
};

function naSet(summary: YearSummary, quarter: number): Partial<Record<NaItemKey, boolean>> {
  const out: Partial<Record<NaItemKey, boolean>> = {};
  for (const mark of summary.naMarks) {
    if (mark.quarter === quarter) out[mark.item_key as NaItemKey] = true;
  }
  return out;
}

function inIsoRange(iso: string, start: string, end: string): boolean {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) return false;
  return time >= Date.parse(start) && time < Date.parse(end);
}

export function quarterSnapshot(summary: YearSummary, year: number, quarter: number, todayYmd: string): QuarterSnapshot {
  const na = naSet(summary, quarter);
  const meetings = summary.meetings.filter((row) => row.quarter === quarter);
  const finalizedMeetings = meetings.filter((row) => row.status === "finalized").length;
  const safetyRow = summary.safety.find((row) => row.quarter === quarter);
  const reviewRow = summary.reviews.find((row) => row.quarter === quarter);
  const drills = summary.drills.filter((row) => row.quarter === quarter);
  const finalizedDrills = drills.filter((row) => row.status === "finalized").length;
  const qapiRow = summary.qapi.find((row) => row.quarter === quarter);
  const bounds = quarterBounds(year, quarter);
  const range = quarterRangeIso(year, quarter);
  const onCallCount = summary.onCallAt.filter((iso) => inIsoRange(iso, range.start, range.end)).length;
  const onCallReady =
    onCallCount > 0 ||
    summary.attestations.some((row) => row.period_kind === "quarter" && row.quarter === quarter);
  const incidentCount = summary.incidentDates.filter(
    (ymd) => compareYmd(ymd, bounds.start) >= 0 && compareYmd(ymd, bounds.end) <= 0
  ).length;
  const base = { year, quarter, todayYmd };
  const items: ChecklistStatus[] = [
    checklistStatus({ ...base, finalized: finalizedMeetings > 0, notApplicable: na.meetings === true }),
    checklistStatus({ ...base, finalized: safetyRow?.status === "finalized", notApplicable: na.safety === true }),
    checklistStatus({
      ...base,
      finalized: reviewRow?.status === "finalized",
      notApplicable: na.emergency_review === true,
    }),
    checklistStatus({ ...base, finalized: finalizedDrills > 0, notApplicable: na.drill === true }),
    checklistStatus({ ...base, finalized: qapiRow?.status === "finalized", notApplicable: na.qapi_review === true }),
  ];
  const hasActivity =
    meetings.length > 0 ||
    Boolean(safetyRow) ||
    Boolean(reviewRow) ||
    drills.length > 0 ||
    Boolean(qapiRow) ||
    onCallCount > 0 ||
    incidentCount > 0 ||
    onCallReady ||
    Object.keys(na).length > 0;
  const active = summary.projects.find((project) => project.status !== "completed") ?? null;
  return {
    meetings: items[0],
    meetingCount: meetings.length,
    finalizedMeetings,
    safety: items[1],
    emergencyReview: items[2],
    drill: items[3],
    finalizedDrills,
    qapi: items[4],
    onCallCount,
    onCallReady,
    incidentCount,
    project: active ? { id: active.id, name: active.project_name, status: active.status } : null,
    rollup: rollupQuarter({
      items,
      hasActivity,
      onCallReady,
      quarterEnded: compareYmd(todayYmd, bounds.end) > 0,
    }),
    na,
  };
}
