import "server-only";

/** Stored in encrypted message body; rendered as @Label in UI (no raw UUIDs). */
const STAFF = /@\[([^\]]+)\]\(staff:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;
const PAT = /@\[([^\]]+)\]\(patient:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;

export type MentionPick = { id: string; label: string };

/**
 * Human-readable text for list previews and notifications (no UUIDs).
 */
export function internalChatBodyForDisplay(canonical: string): string {
  let s = canonical;
  s = s.replace(STAFF, "@$1");
  s = s.replace(PAT, "@$1");
  return s;
}

export function extractStaffMentionIdsFromCanonical(canonical: string): string[] {
  const ids: string[] = [];
  const re = /@\[([^\]]+)\]\(staff:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(canonical)) !== null) {
    ids.push(m[2]);
  }
  return [...new Set(ids)];
}

export function extractPatientMentionIdsFromCanonical(canonical: string): string[] {
  const ids: string[] = [];
  const re = /@\[([^\]]+)\]\(patient:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(canonical)) !== null) {
    ids.push(m[2]);
  }
  return [...new Set(ids)];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Merge composer text (with @DisplayName) and picked mentions into canonical stored form.
 * Longest labels first to avoid partial replacements.
 */
export function mergePicksIntoCanonical(
  displayText: string,
  staffPicks: MentionPick[],
  patientPicks: MentionPick[]
): string {
  const trimmed = displayText.trim();
  if (!trimmed && (staffPicks.length > 0 || patientPicks.length > 0)) {
    const parts: string[] = [];
    for (const p of staffPicks) {
      parts.push(`@[${p.label}](staff:${p.id})`);
    }
    for (const p of patientPicks) {
      parts.push(`@[${p.label}](patient:${p.id})`);
    }
    return parts.join(" ");
  }

  let s = displayText;
  const all = [
    ...staffPicks.map((p) => ({ ...p, kind: "staff" as const })),
    ...patientPicks.map((p) => ({ ...p, kind: "patient" as const })),
  ].sort((a, b) => b.label.length - a.label.length);

  for (const p of all) {
    const label = p.label.trim();
    if (!label) continue;
    const needle = `@${label}`;
    if (!s.includes(needle)) continue;
    const token =
      p.kind === "staff"
        ? `@[${label}](staff:${p.id})`
        : `@[${label}](patient:${p.id})`;
    const re = new RegExp(escapeRegExp(needle), "");
    s = s.replace(re, token);
  }
  return s;
}
