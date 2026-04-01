export type CallLogView = "all" | "missed";
export type CallLogAssigned = "all" | "me";

export type CallLogQuery = {
  view: CallLogView;
  assigned: CallLogAssigned;
  /** Inclusive `YYYY-MM-DD` on `phone_calls.created_at` (UTC day bounds). */
  from: string | null;
  to: string | null;
  limit: number;
};

function firstString(v: string | string[] | undefined): string | undefined {
  if (v === undefined) return undefined;
  if (Array.isArray(v)) return typeof v[0] === "string" ? v[0] : undefined;
  return v;
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function readOptionalYmd(raw: string | string[] | undefined): string | null {
  const s = firstString(raw)?.trim() ?? "";
  return YMD_RE.test(s) ? s : null;
}

function readLimit(raw: string | string[] | undefined): number {
  const s = firstString(raw)?.trim() ?? "";
  const n = Number.parseInt(s, 10);
  if (n === 50 || n === 100 || n === 200) return n;
  return 100;
}

export function parseCallLogSearchParams(raw: Record<string, string | string[] | undefined>): CallLogQuery {
  const viewRaw = firstString(raw.view)?.trim().toLowerCase();
  const view: CallLogView = viewRaw === "missed" ? "missed" : "all";

  const assignedRaw = firstString(raw.assigned)?.trim().toLowerCase();
  const assigned: CallLogAssigned = assignedRaw === "me" ? "me" : "all";

  return {
    view,
    assigned,
    from: readOptionalYmd(raw.from),
    to: readOptionalYmd(raw.to),
    limit: readLimit(raw.limit),
  };
}

export function callLogSearchParamsToQuery(q: CallLogQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (q.view !== "all") p.set("view", q.view);
  if (q.assigned !== "all") p.set("assigned", q.assigned);
  if (q.from) p.set("from", q.from);
  if (q.to) p.set("to", q.to);
  if (q.limit !== 100) p.set("limit", String(q.limit));
  return p;
}
