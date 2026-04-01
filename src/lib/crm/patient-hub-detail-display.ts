export type TimelineEntry =
  | { kind: "sms"; at: string; label: string; body: string }
  | { kind: "call"; at: string; label: string; sub: string; hasVm: boolean };

export function parseVoiceAiMini(meta: unknown): {
  summary: string | null;
  category: string | null;
  urgency: string | null;
} {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { summary: null, category: null, urgency: null };
  }
  const v = (meta as Record<string, unknown>).voice_ai;
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    return { summary: null, category: null, urgency: null };
  }
  const o = v as Record<string, unknown>;
  const summary = typeof o.short_summary === "string" ? o.short_summary.trim().slice(0, 280) : null;
  const category = typeof o.caller_category === "string" ? o.caller_category.trim() : null;
  const urgency = typeof o.urgency === "string" ? o.urgency.trim() : null;
  return { summary: summary || null, category: category || null, urgency: urgency || null };
}

export function formatVisitChip(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
}

export function formatDurationSeconds(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec) || sec < 0) return "—";
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}m ${r}s`;
}
