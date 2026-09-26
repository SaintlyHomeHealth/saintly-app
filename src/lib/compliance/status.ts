import { compareYmd, quarterBounds } from "@/lib/compliance/period";
import type { QapiAutoKey } from "@/lib/compliance/constants";
import { INCIDENT_TO_QAPI } from "@/lib/compliance/constants";

export type ChecklistStatus = "complete" | "due_soon" | "not_complete" | "not_applicable";
export type QuarterRollup = "complete" | "needs_attention" | "not_started";

export const CHECKLIST_STATUS_LABEL: Record<ChecklistStatus, string> = {
  complete: "Complete",
  due_soon: "Due Soon",
  not_complete: "Not Complete",
  not_applicable: "Not Applicable",
};

export const ROLLUP_LABEL: Record<QuarterRollup, string> = {
  complete: "Complete",
  needs_attention: "Needs Attention",
  not_started: "Not Started",
};

export function checklistStatus(input: {
  finalized: boolean;
  notApplicable: boolean;
  year: number;
  quarter: number;
  todayYmd: string;
}): ChecklistStatus {
  if (input.finalized) return "complete";
  const { start, end } = quarterBounds(input.year, input.quarter);
  if (compareYmd(input.todayYmd, start) < 0) return "not_applicable";
  if (input.notApplicable) return "not_applicable";
  if (compareYmd(input.todayYmd, end) > 0) return "not_complete";
  return "due_soon";
}

export function rollupQuarter(input: {
  items: ChecklistStatus[];
  hasActivity: boolean;
  onCallReady: boolean;
  quarterEnded: boolean;
}): QuarterRollup {
  const allClear = input.items.every((item) => item === "complete" || item === "not_applicable");
  const anyComplete = input.items.some((item) => item === "complete");
  const onCallOk = !input.quarterEnded || input.onCallReady;
  if (!input.hasActivity && !anyComplete) return "not_started";
  if (allClear && onCallOk) return "complete";
  return "needs_attention";
}

export type QapiLiveCounts = Record<QapiAutoKey, number>;

export function emptyQapiLiveCounts(): QapiLiveCounts {
  return {
    hospitalizations: 0,
    er_visits: 0,
    falls: 0,
    medication_errors: 0,
    complaints: 0,
    missed_visits: 0,
    infections: 0,
  };
}

export function countsFromIncidentTypes(types: readonly string[]): QapiLiveCounts {
  const counts = emptyQapiLiveCounts();
  for (const type of types) {
    const key = INCIDENT_TO_QAPI[type];
    if (key) counts[key] += 1;
  }
  return counts;
}

export function qapiCountsDiffer(
  saved: Partial<Record<QapiAutoKey, number | null>>,
  live: QapiLiveCounts
): boolean {
  const keys = Object.keys(live) as QapiAutoKey[];
  return keys.some((key) => {
    const value = saved[key];
    if (value == null) return live[key] !== 0;
    return value !== live[key];
  });
}
