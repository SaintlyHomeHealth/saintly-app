import "server-only";

import {
  INTERNAL_CHAT_REF_KINDS,
  type InternalChatRefKind,
  refKindDisplayLabel,
} from "@/lib/internal-chat/internal-chat-ref-kinds";

/** UUID v4 pattern (case-insensitive). */
const U =
  "([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})";

function reToken(kind: "staff" | InternalChatRefKind): RegExp {
  return new RegExp(`@\\[([^\\]]+)\\]\\(${kind}:${U}\\)`, "gi");
}

const STAFF_RE = reToken("staff");
const PAT_RE = reToken("patient");
const LEAD_RE = reToken("lead");
const FACILITY_RE = reToken("facility");
const EMPLOYEE_RE = reToken("employee");
const RECRUIT_RE = reToken("recruit");

export type MentionPick = { id: string; label: string };
export type InternalChatRefPick = { kind: InternalChatRefKind; id: string; label: string };

/**
 * Human-readable text for list previews and notifications (no raw UUIDs).
 * Staff inline mentions stay `@Name`; references use `@Patient: Name`, etc.
 */
export function internalChatBodyForDisplay(canonical: string): string {
  let s = canonical;
  s = s.replace(STAFF_RE, "@$1");
  s = s.replace(PAT_RE, (_, label: string) => `@${refKindDisplayLabel("patient")}: ${label}`);
  s = s.replace(LEAD_RE, (_, label: string) => `@${refKindDisplayLabel("lead")}: ${label}`);
  s = s.replace(FACILITY_RE, (_, label: string) => `@${refKindDisplayLabel("facility")}: ${label}`);
  s = s.replace(EMPLOYEE_RE, (_, label: string) => `@${refKindDisplayLabel("employee")}: ${label}`);
  s = s.replace(RECRUIT_RE, (_, label: string) => `@${refKindDisplayLabel("recruit")}: ${label}`);
  return s;
}

function collectIds(re: RegExp, canonical: string): string[] {
  const ids: string[] = [];
  const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  let m: RegExpExecArray | null;
  while ((m = r.exec(canonical)) !== null) {
    ids.push(m[2]);
  }
  return [...new Set(ids)];
}

export function extractStaffMentionIdsFromCanonical(canonical: string): string[] {
  return collectIds(STAFF_RE, canonical);
}

export function extractPatientMentionIdsFromCanonical(canonical: string): string[] {
  return collectIds(PAT_RE, canonical);
}

export function extractLeadMentionIdsFromCanonical(canonical: string): string[] {
  return collectIds(LEAD_RE, canonical);
}

export function extractFacilityMentionIdsFromCanonical(canonical: string): string[] {
  return collectIds(FACILITY_RE, canonical);
}

export function extractEmployeeMentionIdsFromCanonical(canonical: string): string[] {
  return collectIds(EMPLOYEE_RE, canonical);
}

export function extractRecruitMentionIdsFromCanonical(canonical: string): string[] {
  return collectIds(RECRUIT_RE, canonical);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Merge composer text and picks into canonical stored form.
 * Reference lines use `@Patient: Label` (see `refComposerToken`). Legacy patient may use `@Label` only.
 */
export function mergePicksIntoCanonical(
  displayText: string,
  staffPicks: MentionPick[],
  referencePicks: InternalChatRefPick[],
  legacyPatientPicks?: MentionPick[]
): string {
  const refList: InternalChatRefPick[] = [...referencePicks];
  if (legacyPatientPicks?.length) {
    for (const p of legacyPatientPicks) {
      refList.push({ kind: "patient", id: p.id, label: p.label });
    }
  }

  const trimmed = displayText.trim();
  if (!trimmed && staffPicks.length === 0 && refList.length === 0) {
    return "";
  }

  if (!trimmed && (staffPicks.length > 0 || refList.length > 0)) {
    const parts: string[] = [];
    for (const p of staffPicks) {
      parts.push(`@[${p.label}](staff:${p.id})`);
    }
    for (const p of refList) {
      parts.push(`@[${p.label}](${p.kind}:${p.id})`);
    }
    return parts.join(" ");
  }

  let s = displayText;
  const refSorted = [...refList].sort((a, b) => b.label.length - a.label.length);
  for (const p of refSorted) {
    const label = p.label.trim();
    if (!label) continue;
    const kindLabel = refKindDisplayLabel(p.kind);
    const needle = `@${kindLabel}: ${label}`;
    const token = `@[${label}](${p.kind}:${p.id})`;
    if (s.includes(needle)) {
      s = s.split(needle).join(token);
      continue;
    }
    if (p.kind === "patient") {
      const leg = `@${label}`;
      if (s.includes(leg)) {
        s = s.split(leg).join(token);
      }
    }
  }

  const staffSorted = [...staffPicks].sort((a, b) => b.label.length - a.label.length);
  for (const p of staffSorted) {
    const label = p.label.trim();
    if (!label) continue;
    const needle = `@${label}`;
    if (!s.includes(needle)) continue;
    s = s.replace(new RegExp(escapeRegExp(needle), ""), `@[${label}](staff:${p.id})`);
  }
  return s;
}

/** Every reference token in canonical body (order preserved by kind scan). */
export function extractReferenceTokensFromCanonical(
  canonical: string
): Array<{ kind: InternalChatRefKind; label: string; id: string }> {
  const out: Array<{ kind: InternalChatRefKind; label: string; id: string }> = [];
  for (const kind of INTERNAL_CHAT_REF_KINDS) {
    const re = reToken(kind);
    const r = new RegExp(re.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = r.exec(canonical)) !== null) {
      out.push({ kind, label: m[1], id: m[2] });
    }
  }
  return out;
}
