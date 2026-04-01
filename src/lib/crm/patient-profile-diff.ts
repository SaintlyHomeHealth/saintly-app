export type FieldChange = {
  field: string;
  before: string | null;
  after: string | null;
};

export function diffString(field: string, before: unknown, after: unknown): FieldChange | null {
  const b = String(before ?? "");
  const a = String(after ?? "");
  const bTrim = b.trim();
  const aTrim = a.trim();
  if (bTrim === aTrim) return null;
  return { field, before: bTrim === "" ? null : bTrim, after: aTrim === "" ? null : aTrim };
}

export function diffNumber(field: string, before: unknown, after: unknown): FieldChange | null {
  const norm = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = typeof v === "number" ? v : parseInt(String(v), 10);
    return Number.isFinite(n) ? n : null;
  };
  const b = norm(before);
  const a = norm(after);
  if (b === a) return null;
  return {
    field,
    before: b === null ? null : String(b),
    after: a === null ? null : String(a),
  };
}

export function truncateChanges(changes: FieldChange[], maxLen = 500): FieldChange[] {
  const clip = (s: string | null) => {
    if (s === null) return null;
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  };
  return changes.map((c) => ({ ...c, before: clip(c.before), after: clip(c.after) }));
}
