import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { normalizePhoneDigits } from "@/lib/crm/facility-match";
import { phoenixTodayYmd } from "@/lib/recruiting/phoenix-time";
import {
  matchExternalAgainstTargets,
  websiteDomain,
  type PtColdCallTargetForMatch,
} from "@/lib/recruiting/pt-cold-call-match";
import {
  isValidPtColdCallStatus,
  PT_COLD_CALL_DISCIPLINE_OPTIONS,
} from "@/lib/recruiting/pt-cold-call-options";
import type {
  PtColdCallLogRow,
  PtColdCallTargetRow,
  PtColdCallTargetWithLatest,
} from "@/lib/recruiting/pt-cold-call-types";

const TARGET_SELECT =
  "id, created_at, updated_at, clinic_name, google_place_id, phone, normalized_phone, website, website_domain, address, city, state, zip_code, latitude, longitude, google_rating, google_review_count, google_maps_url, source, lead_category, pipeline, recruiting_type, discipline_target, status, contact_person, contact_title, recruiter_notes, call_attempts, last_called_at, next_follow_up_at, follow_up_reason, outcome, do_not_call, converted_candidate_id, created_by_user_id";

const LOG_SELECT =
  "id, created_at, target_id, call_date, call_time, called_at, person_spoke_with, person_title, call_outcome, status_set, notes, next_follow_up_at, staff_user_id";

const TARGET_MATCH_SELECT =
  "id, clinic_name, city, address, zip_code, normalized_phone, website_domain, google_place_id, status, last_called_at, next_follow_up_at";

/** Statuses that imply a real call was made (so call_attempts / last_called_at advance). */
const CALLED_STATUSES = new Set<string>([
  "Called - No Answer",
  "Left Voicemail",
  "Gatekeeper",
  "Asked for Manager",
  "Interested",
  "Candidate Identified",
  "Interview Scheduled",
  "Hired",
  "Not Interested",
  "Bad Number",
]);

export async function fetchTargetsForMatch(): Promise<PtColdCallTargetForMatch[]> {
  const { data } = await supabaseAdmin
    .from("recruiting_call_targets")
    .select(TARGET_MATCH_SELECT)
    .limit(5000);
  return (data ?? []) as PtColdCallTargetForMatch[];
}

export async function fetchTargetsWithLatest(): Promise<PtColdCallTargetWithLatest[]> {
  const { data } = await supabaseAdmin
    .from("recruiting_call_targets")
    .select(TARGET_SELECT)
    .order("updated_at", { ascending: false })
    .limit(5000);

  const targets = (data ?? []) as PtColdCallTargetRow[];
  if (targets.length === 0) return [];

  const ids = targets.map((t) => t.id);
  const latestByTarget = new Map<string, PtColdCallLogRow>();

  const { data: logs } = await supabaseAdmin
    .from("recruiting_call_logs")
    .select(LOG_SELECT)
    .in("target_id", ids)
    .order("called_at", { ascending: false })
    .limit(10000);

  for (const log of (logs ?? []) as PtColdCallLogRow[]) {
    if (!latestByTarget.has(log.target_id)) latestByTarget.set(log.target_id, log);
  }

  return targets.map((t) => ({ ...t, latest_log: latestByTarget.get(t.id) ?? null }));
}

export async function fetchLatestLog(targetId: string): Promise<PtColdCallLogRow | null> {
  const { data } = await supabaseAdmin
    .from("recruiting_call_logs")
    .select(LOG_SELECT)
    .eq("target_id", targetId)
    .order("called_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as PtColdCallLogRow | null) ?? null;
}

export type QuickAddColdCallInput = {
  clinic_name: string;
  google_place_id?: string | null;
  phone?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  google_rating?: number | null;
  google_review_count?: number | null;
  google_maps_url?: string | null;
  status?: string | null;
  contact_person?: string | null;
  contact_title?: string | null;
  notes?: string | null;
  call_outcome?: string | null;
  next_follow_up_at?: string | null;
  follow_up_reason?: string | null;
  do_not_call?: boolean;
  create_anyway?: boolean;
};

export type QuickAddDuplicate = {
  id: string;
  clinic_name: string;
  city: string | null;
  status: string | null;
  last_called_at: string | null;
  next_follow_up_at: string | null;
  latest_note: string | null;
  match_reason: string;
};

export type QuickAddResult =
  | { ok: true; target_id: string; clinic_name: string }
  | { ok: false; error: string; duplicate?: QuickAddDuplicate };

function googleMapsUrlForPlace(placeId: string | null | undefined, fallbackAddress: string): string | null {
  const id = (placeId ?? "").trim();
  if (id) return `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(id)}`;
  const addr = fallbackAddress.trim();
  if (addr) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr)}`;
  return null;
}

export async function quickAddColdCallTarget(
  input: QuickAddColdCallInput,
  userId: string | null
): Promise<QuickAddResult> {
  const clinic_name = (input.clinic_name ?? "").trim();
  if (!clinic_name) return { ok: false, error: "missing_name" };

  const phone = (input.phone ?? "").trim() || null;
  const website = (input.website ?? "").trim() || null;
  const address = (input.address ?? "").trim() || null;
  const city = (input.city ?? "").trim() || null;
  const state = (input.state ?? "").trim() || null;
  const zip = (input.zip_code ?? "").trim() || null;

  const formatted_address = [address, [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")]
    .filter(Boolean)
    .join(", ");

  if (!input.create_anyway) {
    const targets = await fetchTargetsForMatch();
    const match = matchExternalAgainstTargets(
      {
        google_place_id: (input.google_place_id ?? "").trim(),
        clinic_name,
        formatted_address,
        phone,
        website,
        city,
      },
      targets
    );
    if (match.match_status !== "new" && match.matched_target_id) {
      const latest = await fetchLatestLog(match.matched_target_id);
      return {
        ok: false,
        error: "possible_duplicate",
        duplicate: {
          id: match.matched_target_id,
          clinic_name: match.matched_target_name ?? clinic_name,
          city,
          status: match.matched_status,
          last_called_at: match.matched_last_called_at,
          next_follow_up_at: match.matched_next_follow_up_at,
          latest_note: latest?.notes ?? null,
          match_reason: match.match_reason,
        },
      };
    }
  }

  const statusRaw = (input.status ?? "").trim();
  const status = statusRaw && isValidPtColdCallStatus(statusRaw) ? statusRaw : "New";
  const contact_person = (input.contact_person ?? "").trim() || null;
  const contact_title = (input.contact_title ?? "").trim() || null;
  const notes = (input.notes ?? "").trim() || null;
  const call_outcome = (input.call_outcome ?? "").trim() || null;
  const do_not_call = Boolean(input.do_not_call) || status === "Do Not Call";

  const countsAsCall = Boolean(call_outcome) || Boolean(contact_person) || CALLED_STATUSES.has(status);
  const now = new Date().toISOString();

  const googleMapsUrl =
    (input.google_maps_url ?? "").trim() || googleMapsUrlForPlace(input.google_place_id, formatted_address);

  const { data, error } = await supabaseAdmin
    .from("recruiting_call_targets")
    .insert({
      clinic_name,
      google_place_id: (input.google_place_id ?? "").trim() || null,
      phone,
      normalized_phone: normalizePhoneDigits(phone) || null,
      website,
      website_domain: websiteDomain(website) || null,
      address,
      city,
      state,
      zip_code: zip,
      latitude: typeof input.latitude === "number" ? input.latitude : null,
      longitude: typeof input.longitude === "number" ? input.longitude : null,
      google_rating: typeof input.google_rating === "number" ? input.google_rating : null,
      google_review_count: typeof input.google_review_count === "number" ? input.google_review_count : null,
      google_maps_url: googleMapsUrl,
      source: "google_places",
      lead_category: "employment",
      pipeline: "pt_cold_calling",
      recruiting_type: "pt_clinic_cold_call",
      discipline_target: "PT/PTA",
      status,
      contact_person,
      contact_title,
      recruiter_notes: notes,
      call_attempts: countsAsCall ? 1 : 0,
      last_called_at: countsAsCall ? now : null,
      next_follow_up_at: input.next_follow_up_at ?? null,
      follow_up_reason: (input.follow_up_reason ?? "").trim() || null,
      outcome: call_outcome,
      do_not_call,
      created_by_user_id: userId,
    })
    .select("id, clinic_name")
    .maybeSingle();

  if (error || !data?.id) {
    if (error?.code === "23505") return { ok: false, error: "duplicate_google_place_id" };
    console.warn("[pt-cold-call] quick add insert:", error?.message);
    return { ok: false, error: "save_failed" };
  }

  // First call log captures the opening interaction (even if just a status note).
  await supabaseAdmin.from("recruiting_call_logs").insert({
    target_id: data.id,
    call_date: phoenixTodayYmd(),
    called_at: now,
    person_spoke_with: contact_person,
    person_title: contact_title,
    call_outcome,
    status_set: status,
    notes,
    next_follow_up_at: input.next_follow_up_at ?? null,
    staff_user_id: userId,
  });

  return { ok: true, target_id: String(data.id), clinic_name: String(data.clinic_name) };
}

export type AddCallLogInput = {
  status?: string | null;
  person_spoke_with?: string | null;
  person_title?: string | null;
  call_outcome?: string | null;
  notes?: string | null;
  next_follow_up_at?: string | null;
  follow_up_reason?: string | null;
  do_not_call?: boolean | null;
  counts_as_call?: boolean;
};

export type AddCallLogResult =
  | { ok: true; target: PtColdCallTargetRow; log: PtColdCallLogRow }
  | { ok: false; error: string };

export async function addCallLog(
  targetId: string,
  input: AddCallLogInput,
  userId: string | null
): Promise<AddCallLogResult> {
  const { data: current } = await supabaseAdmin
    .from("recruiting_call_targets")
    .select("id, call_attempts, contact_person, contact_title")
    .eq("id", targetId)
    .maybeSingle();

  if (!current?.id) return { ok: false, error: "not_found" };

  const statusRaw = (input.status ?? "").trim();
  const status = statusRaw && isValidPtColdCallStatus(statusRaw) ? statusRaw : null;
  const person = (input.person_spoke_with ?? "").trim() || null;
  const title = (input.person_title ?? "").trim() || null;
  const outcome = (input.call_outcome ?? "").trim() || null;
  const notes = (input.notes ?? "").trim() || null;
  const now = new Date().toISOString();

  const countsAsCall =
    input.counts_as_call ?? (Boolean(outcome) || Boolean(person) || (status ? CALLED_STATUSES.has(status) : false));

  const { data: logData, error: logErr } = await supabaseAdmin
    .from("recruiting_call_logs")
    .insert({
      target_id: targetId,
      call_date: phoenixTodayYmd(),
      called_at: now,
      person_spoke_with: person,
      person_title: title,
      call_outcome: outcome,
      status_set: status,
      notes,
      next_follow_up_at: input.next_follow_up_at ?? null,
      staff_user_id: userId,
    })
    .select(LOG_SELECT)
    .maybeSingle();

  if (logErr || !logData) {
    console.warn("[pt-cold-call] add log:", logErr?.message);
    return { ok: false, error: "save_failed" };
  }

  const patch: Record<string, unknown> = {};
  if (status) patch.status = status;
  if (status === "Do Not Call" || input.do_not_call === true) patch.do_not_call = true;
  if (input.do_not_call === false) patch.do_not_call = false;
  if (person) patch.contact_person = person;
  if (title) patch.contact_title = title;
  if (outcome) patch.outcome = outcome;
  if (notes) patch.recruiter_notes = notes;
  if (input.next_follow_up_at !== undefined) patch.next_follow_up_at = input.next_follow_up_at ?? null;
  if (input.follow_up_reason !== undefined) patch.follow_up_reason = (input.follow_up_reason ?? "").trim() || null;
  if (countsAsCall) {
    patch.call_attempts = ((current.call_attempts as number) ?? 0) + 1;
    patch.last_called_at = now;
  }

  const { data: targetData, error: updErr } = await supabaseAdmin
    .from("recruiting_call_targets")
    .update(patch)
    .eq("id", targetId)
    .select(TARGET_SELECT)
    .maybeSingle();

  if (updErr || !targetData) {
    console.warn("[pt-cold-call] update after log:", updErr?.message);
    return { ok: false, error: "save_failed" };
  }

  return { ok: true, target: targetData as PtColdCallTargetRow, log: logData as PtColdCallLogRow };
}

export type UpdateTargetInput = {
  status?: string | null;
  contact_person?: string | null;
  contact_title?: string | null;
  next_follow_up_at?: string | null;
  follow_up_reason?: string | null;
  do_not_call?: boolean | null;
  recruiter_notes?: string | null;
};

export async function updateColdCallTarget(
  targetId: string,
  input: UpdateTargetInput
): Promise<{ ok: true; target: PtColdCallTargetRow } | { ok: false; error: string }> {
  const patch: Record<string, unknown> = {};

  if (input.status !== undefined) {
    const statusRaw = (input.status ?? "").trim();
    if (statusRaw && isValidPtColdCallStatus(statusRaw)) {
      patch.status = statusRaw;
      if (statusRaw === "Do Not Call") patch.do_not_call = true;
    }
  }
  if (input.contact_person !== undefined) patch.contact_person = (input.contact_person ?? "").trim() || null;
  if (input.contact_title !== undefined) patch.contact_title = (input.contact_title ?? "").trim() || null;
  if (input.recruiter_notes !== undefined) patch.recruiter_notes = (input.recruiter_notes ?? "").trim() || null;
  if (input.next_follow_up_at !== undefined) patch.next_follow_up_at = input.next_follow_up_at ?? null;
  if (input.follow_up_reason !== undefined) patch.follow_up_reason = (input.follow_up_reason ?? "").trim() || null;
  if (input.do_not_call !== undefined && input.do_not_call !== null) patch.do_not_call = input.do_not_call;

  if (Object.keys(patch).length === 0) return { ok: false, error: "nothing_to_update" };

  const { data, error } = await supabaseAdmin
    .from("recruiting_call_targets")
    .update(patch)
    .eq("id", targetId)
    .select(TARGET_SELECT)
    .maybeSingle();

  if (error || !data) {
    console.warn("[pt-cold-call] update target:", error?.message);
    return { ok: false, error: "save_failed" };
  }

  return { ok: true, target: data as PtColdCallTargetRow };
}

export type ConvertToCandidateInput = {
  candidate_name: string;
  candidate_phone?: string | null;
  candidate_email?: string | null;
  discipline?: string | null;
  notes?: string | null;
  application_status?: string | null;
};

export async function convertTargetToCandidate(
  targetId: string,
  input: ConvertToCandidateInput,
  userId: string | null
): Promise<
  | { ok: true; candidate_id: string; target: PtColdCallTargetRow }
  | { ok: false; error: string }
> {
  const full_name = (input.candidate_name ?? "").trim();
  if (!full_name) return { ok: false, error: "missing_name" };

  const { data: target } = await supabaseAdmin
    .from("recruiting_call_targets")
    .select(TARGET_SELECT)
    .eq("id", targetId)
    .maybeSingle();

  if (!target) return { ok: false, error: "not_found" };
  const targetRow = target as PtColdCallTargetRow;

  const disciplineRaw = (input.discipline ?? "").trim();
  const discipline =
    disciplineRaw && (PT_COLD_CALL_DISCIPLINE_OPTIONS as readonly string[]).includes(disciplineRaw)
      ? disciplineRaw
      : "PT";

  const noteParts = [
    `Sourced via PT/PTA cold call at ${targetRow.clinic_name}.`,
    (input.notes ?? "").trim(),
  ].filter(Boolean);

  const { data: candidate, error: candErr } = await supabaseAdmin
    .from("recruiting_candidates")
    .insert({
      full_name,
      phone: (input.candidate_phone ?? "").trim() || null,
      email: (input.candidate_email ?? "").trim() || null,
      city: targetRow.city,
      state: targetRow.state,
      discipline,
      source: "Other",
      status: (input.application_status ?? "").trim() || "New",
      notes: noteParts.join(" "),
      assigned_to: userId,
    })
    .select("id")
    .maybeSingle();

  if (candErr || !candidate?.id) {
    console.warn("[pt-cold-call] convert candidate:", candErr?.message);
    return { ok: false, error: "save_failed" };
  }

  const { data: updated } = await supabaseAdmin
    .from("recruiting_call_targets")
    .update({
      converted_candidate_id: candidate.id,
      status: "Candidate Identified",
      contact_person: targetRow.contact_person ?? full_name,
    })
    .eq("id", targetId)
    .select(TARGET_SELECT)
    .maybeSingle();

  return {
    ok: true,
    candidate_id: String(candidate.id),
    target: (updated as PtColdCallTargetRow | null) ?? targetRow,
  };
}
