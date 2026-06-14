import { devPerfEnabled } from "@/lib/perf/client-dev-perf";

type OutreachPerfSnapshot = {
  apiCalls: number;
  facilityRowsFetched: number;
  cardsRendered: number;
  slowestQueryMs: number;
  slowestQueryLabel: string;
  refetchCount: number;
};

let snapshot: OutreachPerfSnapshot = {
  apiCalls: 0,
  facilityRowsFetched: 0,
  cardsRendered: 0,
  slowestQueryMs: 0,
  slowestQueryLabel: "",
  refetchCount: 0,
};

let initialLoadDone = false;

export function resetOutreachPerf(): void {
  snapshot = {
    apiCalls: 0,
    facilityRowsFetched: 0,
    cardsRendered: 0,
    slowestQueryMs: 0,
    slowestQueryLabel: "",
    refetchCount: 0,
  };
  initialLoadDone = false;
}

export function trackOutreachApiCall(label: string, ms: number, rowCount = 0): void {
  if (!devPerfEnabled()) return;
  snapshot.apiCalls += 1;
  snapshot.facilityRowsFetched += rowCount;
  if (ms > snapshot.slowestQueryMs) {
    snapshot.slowestQueryMs = ms;
    snapshot.slowestQueryLabel = label;
  }
  if (initialLoadDone) {
    snapshot.refetchCount += 1;
  }
}

export function trackOutreachCardsRendered(count: number): void {
  if (!devPerfEnabled()) return;
  snapshot.cardsRendered += count;
}

export function markOutreachInitialLoadDone(): void {
  if (!devPerfEnabled()) return;
  initialLoadDone = true;
}

export function logOutreachPerfSummary(): void {
  if (!devPerfEnabled()) return;
  console.info("[perf-outreach]", {
    ...snapshot,
    refetchAfterInitial: snapshot.refetchCount > 0,
  });
}
