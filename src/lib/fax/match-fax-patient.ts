import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { normalizePersonName, parseDobToIso } from "@/lib/fax/fax-extraction-heuristics";

export type FaxPatientMatch = {
  status: "exact" | "near" | "none";
  patientId: string | null;
  displayName?: string | null;
  candidates?: Array<{ patientId: string; displayName: string; dob: string | null }>;
};

function tokens(name: string): { last: string; first: string; firstInitial: string } {
  const normalized = normalizePersonName(name) ?? name;
  const [lastRaw, firstRaw] = normalized.includes(",")
    ? normalized.split(",").map((s) => s.trim())
    : (() => {
        const parts = normalized.trim().split(/\s+/);
        return [parts[parts.length - 1] ?? "", parts.slice(0, -1).join(" ")];
      })();
  const last = (lastRaw ?? "").toLowerCase();
  const first = (firstRaw ?? "").toLowerCase();
  return { last, first, firstInitial: first.slice(0, 1) };
}

function namesClose(a: ReturnType<typeof tokens>, b: ReturnType<typeof tokens>): "exact" | "near" | "none" {
  if (!a.last || !b.last) return "none";
  if (a.last !== b.last) return "none";
  if (a.first && b.first && (a.first === b.first || a.first.startsWith(b.first) || b.first.startsWith(a.first))) {
    return "exact";
  }
  if (a.firstInitial && b.firstInitial && a.firstInitial === b.firstInitial) return "near";
  if (!a.first || !b.first) return "near";
  return "none";
}

/**
 * Fuzzy-match an extracted patient name + DOB against CRM patients.
 * Exact: last name + first name (or prefix) and matching DOB when both exist.
 * Near: last name + first initial, or name match without DOB.
 */
export async function matchFaxPatient(input: {
  name: string;
  dob?: string | null;
}): Promise<FaxPatientMatch> {
  const want = tokens(input.name);
  if (!want.last) return { status: "none", patientId: null };
  const wantDob = parseDobToIso(input.dob);

  const { data, error } = await supabaseAdmin
    .from("patients")
    .select("id, contacts ( full_name, first_name, last_name, date_of_birth )")
    .is("archived_at", null)
    .limit(800);

  if (error || !data) {
    console.warn("[fax/match] patients_query_failed", { error: error?.message });
    return { status: "none", patientId: null };
  }

  const exact: FaxPatientMatch["candidates"] = [];
  const near: FaxPatientMatch["candidates"] = [];

  for (const row of data) {
    const contact = (row as { contacts?: Record<string, unknown> | Record<string, unknown>[] }).contacts;
    const c = Array.isArray(contact) ? contact[0] : contact;
    if (!c) continue;
    const display =
      (typeof c.full_name === "string" && c.full_name) ||
      [c.first_name, c.last_name].filter((x) => typeof x === "string").join(" ");
    if (!display) continue;
    const got = tokens(display);
    const closeness = namesClose(want, got);
    if (closeness === "none") continue;
    const dob = parseDobToIso(typeof c.date_of_birth === "string" ? c.date_of_birth : null);
    const candidate = { patientId: row.id as string, displayName: display, dob };
    const dobMatch = Boolean(wantDob && dob && wantDob === dob);
    if (closeness === "exact" && (!wantDob || !dob || dobMatch)) {
      if (wantDob && dob && !dobMatch) {
        near.push(candidate);
      } else {
        exact.push(candidate);
      }
    } else {
      near.push(candidate);
    }
  }

  if (exact.length === 1) {
    return { status: "exact", patientId: exact[0]!.patientId, displayName: exact[0]!.displayName };
  }
  if (exact.length > 1) {
    return { status: "near", patientId: null, candidates: exact.slice(0, 5) };
  }
  if (near.length === 1) {
    return { status: "near", patientId: near[0]!.patientId, displayName: near[0]!.displayName, candidates: near };
  }
  if (near.length > 1) {
    return { status: "near", patientId: null, candidates: near.slice(0, 5) };
  }
  return { status: "none", patientId: null };
}
