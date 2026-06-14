import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  haversineDistanceMiles,
  isValidGeoPoint,
  type GeoPoint,
} from "@/lib/crm/facility-geolocation";
import {
  normalizeFacilityName,
  similarFacilityNames,
} from "@/lib/crm/facility-match";
import type { FacilityReferralAiDetection } from "@/lib/crm/facility-referral-lead-types";
import {
  isAllowedQuickLogActivityType,
  isAllowedQuickLogOutcome,
  QUICK_LOG_REFERRAL_POTENTIAL,
} from "@/lib/crm/facility-quick-log";
import { fetchCrmOpenAiJsonObject } from "@/lib/crm/openai-crm-task-json";
import { APP_TIME_ZONE } from "@/lib/datetime/app-timezone";

export type FacilityAiCaptureSourceContext =
  | "finder"
  | "discover"
  | "route_builder"
  | "facility_detail"
  | "facilities_list";

export type FacilityAiPossibleMatch = {
  id: string;
  name: string;
  city: string | null;
  match_confidence: number;
  match_reason: string;
};

export type FacilityAiCaptureDraft = {
  facility_name: string | null;
  matched_facility_id: string | null;
  matched_facility_name: string | null;
  match_confidence: number;
  match_reason: string | null;
  possible_matches: FacilityAiPossibleMatch[];
  activity_type: string;
  outcome: string | null;
  notes: string;
  contact_name: string | null;
  contact_role: string | null;
  follow_up_task: string | null;
  next_follow_up_at: string | null;
  materials_dropped_off: boolean;
  requested_packet: boolean;
  referral_process_captured: boolean;
  decision_maker_met: boolean;
  referral_potential: string | null;
  confidence: number;
  warnings: string[];
  needs_user_confirmation: boolean;
  ai_summary: string | null;
  referral_detection: FacilityReferralAiDetection | null;
};

const AI_ACTIVITY_MAP: Record<string, string> = {
  "drop-in": "Cold Drop-In",
  drop_in: "Cold Drop-In",
  "cold drop-in": "Cold Drop-In",
  "in-person visit": "In-Person Visit",
  "phone call": "Phone Call",
  voicemail: "Voicemail",
  text: "Text",
  email: "Email",
  fax: "Fax Drop",
  "packet dropped": "Packet Dropped",
  "referral received": "Referral Received",
  "follow-up needed": "Follow-Up Visit",
  "follow up needed": "Follow-Up Visit",
  other: "Other",
};

const AI_OUTCOME_MAP: Record<string, string> = {
  "no answer": "No Answer",
  "front desk only": "Front Desk Only",
  "left materials": "Left Materials",
  "good conversation": "Good Conversation",
  "met decision maker": "Met Decision Maker",
  "wants packet faxed": "Wants Packet Faxed",
  "wants email info": "Wants Email Info",
  "asked to follow up": "Asked to Follow Up",
  "referral sent": "Referral Sent",
  "not interested": "Not Interested",
  "already has agency": "Already Have Agency",
  "already have agency": "Already Have Agency",
  "future opportunity": "Future Opportunity",
};

function mapActivityType(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "Cold Drop-In";
  if (isAllowedQuickLogActivityType(s)) return s;
  const mapped = AI_ACTIVITY_MAP[s.toLowerCase()];
  if (mapped && isAllowedQuickLogActivityType(mapped)) return mapped;
  return "Cold Drop-In";
}

function mapOutcome(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  if (isAllowedQuickLogOutcome(s)) return s;
  const mapped = AI_OUTCOME_MAP[s.toLowerCase()];
  if (mapped && isAllowedQuickLogOutcome(mapped)) return mapped;
  return null;
}

function mapReferralPotential(raw: unknown): string | null {
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const lower = s.toLowerCase();
  for (const p of QUICK_LOG_REFERRAL_POTENTIAL) {
    if (p.toLowerCase() === lower) return p;
  }
  return null;
}

function parseIsoDate(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function phoenixTodayLabel(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date());
}

function buildSystemPrompt(): string {
  return `You are a field sales assistant for Saintly Home Health outside sales reps visiting referral-source facilities (doctor offices, SNFs, clinics, etc.) in Arizona.

Extract structured visit data from messy field notes. Return ONLY valid JSON with these keys:
- facility_name: string or null (best guess facility name mentioned)
- activity_type: one of Drop-in, In-Person Visit, Phone Call, Voicemail, Text, Email, Fax, Packet Dropped, Referral Received, Follow-Up Needed, Other
- outcome: one of No answer, Front desk only, Left materials, Good conversation, Met decision maker, Wants packet faxed, Wants email info, Asked to follow up, Referral sent, Not interested, Already has agency, Future opportunity, or null
- notes: cleaned professional note (1-4 sentences)
- contact_name: string or null
- contact_role: string or null (e.g. Office Manager, Referral Coordinator)
- follow_up_task: string or null
- next_follow_up_at: ISO 8601 datetime string in UTC, or null. Today is ${phoenixTodayLabel()} in America/Phoenix. Resolve relative dates like "next Tuesday" to a concrete date at 5:00 PM America/Phoenix.
- materials_dropped_off: boolean
- requested_packet: boolean
- referral_process_captured: boolean
- decision_maker_met: boolean
- referral_potential: Cold, Warm, Hot, Not interested, or null
- confidence: number 0-1 for overall extraction quality
- warnings: string array (e.g. "Follow-up date needs confirmation")
- ai_summary: one-line summary for activity list
- referral_detected: boolean — true if notes mention a patient referral opportunity
- patient_first_name: string or null
- patient_last_name: string or null
- patient_phone: string or null
- patient_dob: YYYY-MM-DD or null
- payer: insurance/payer name or null
- service_needed: PT, OT, ST, RN, HHA, MSW, or null
- referral_notes: brief note about the referral opportunity or null
- should_create_referral_lead: boolean — true when a referral lead should be considered after saving

Be conservative. If unsure about facility name or date, lower confidence and add warnings. Do not invent patient details.`;
}

type PortalFacilityRow = {
  id: string;
  name: string;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
};

export async function scoreFacilityMatches(
  facilities: PortalFacilityRow[],
  opts: {
    extractedName: string | null;
    selectedFacilityId: string | null;
    origin: GeoPoint | null;
    routeDraftStops: Array<{ facilityId?: string; name: string }>;
  }
): Promise<FacilityAiPossibleMatch[]> {
  const scored: FacilityAiPossibleMatch[] = [];

  if (opts.selectedFacilityId) {
    const selected = facilities.find((f) => f.id === opts.selectedFacilityId);
    if (selected) {
      return [
        {
          id: selected.id,
          name: selected.name,
          city: selected.city,
          match_confidence: 1,
          match_reason: "Selected facility",
        },
      ];
    }
  }

  for (const f of facilities) {
    let confidence = 0;
    const reasons: string[] = [];

    if (opts.extractedName && similarFacilityNames(opts.extractedName, f.name)) {
      confidence += 0.72;
      reasons.push("Similar name");
    } else if (
      opts.extractedName &&
      normalizeFacilityName(f.name).length >= 8 &&
      normalizeFacilityName(opts.extractedName).includes(normalizeFacilityName(f.name).slice(0, 8))
    ) {
      confidence += 0.45;
      reasons.push("Partial name match");
    }

    const routeStop = opts.routeDraftStops.find((s) => s.facilityId === f.id);
    if (routeStop) {
      confidence += 0.35;
      reasons.push("On route draft");
      if (opts.extractedName && similarFacilityNames(opts.extractedName, routeStop.name)) {
        confidence += 0.2;
        reasons.push("Matches route stop name");
      }
    }

    if (opts.origin && isValidGeoPoint({ latitude: f.latitude ?? NaN, longitude: f.longitude ?? NaN })) {
      const dist = haversineDistanceMiles(opts.origin, {
        latitude: f.latitude!,
        longitude: f.longitude!,
      });
      if (dist <= 2) {
        confidence += 0.25;
        reasons.push(`Within ${dist.toFixed(1)} mi`);
      } else if (dist <= 8) {
        confidence += 0.1;
        reasons.push(`Nearby (${dist.toFixed(1)} mi)`);
      }
    }

    if (confidence >= 0.35) {
      scored.push({
        id: f.id,
        name: f.name,
        city: f.city,
        match_confidence: Math.min(1, confidence),
        match_reason: reasons.join("; ") || "Possible match",
      });
    }
  }

  scored.sort((a, b) => b.match_confidence - a.match_confidence);
  return scored.slice(0, 8);
}

export async function analyzeFacilityNoteWithAi(input: {
  raw_text: string;
  selected_facility_id?: string | null;
  selected_facility_name?: string | null;
  current_latitude?: number | null;
  current_longitude?: number | null;
  source_context?: FacilityAiCaptureSourceContext;
  route_draft_stops?: Array<{ facilityId?: string; googlePlaceId?: string; name: string }>;
  supabase: SupabaseClient;
}): Promise<{ ok: true; draft: FacilityAiCaptureDraft } | { ok: false; error: string }> {
  const raw = (input.raw_text ?? "").trim();
  if (raw.length < 8) {
    return { ok: false, error: "note_too_short" };
  }

  if (!process.env.OPENAI_API_KEY?.trim()) {
    return { ok: false, error: "ai_not_configured" };
  }

  const userPayload = {
    note: raw,
    selected_facility_id: input.selected_facility_id ?? null,
    selected_facility_name: input.selected_facility_name ?? null,
    source_context: input.source_context ?? null,
    route_draft_stop_names: (input.route_draft_stops ?? []).map((s) => s.name).slice(0, 20),
    location:
      typeof input.current_latitude === "number" && typeof input.current_longitude === "number"
        ? { latitude: input.current_latitude, longitude: input.current_longitude }
        : null,
  };

  const aiRaw = await fetchCrmOpenAiJsonObject(
    process.env.SAINTLY_FACILITY_AI_CAPTURE_MODEL?.trim() || "gpt-4o-mini",
    buildSystemPrompt(),
    JSON.stringify(userPayload)
  );

  if (!aiRaw || typeof aiRaw !== "object") {
    return { ok: false, error: "ai_failed" };
  }

  const ai = aiRaw as Record<string, unknown>;
  const warnings = Array.isArray(ai.warnings)
    ? ai.warnings.filter((w): w is string => typeof w === "string")
    : [];

  const activity_type = mapActivityType(ai.activity_type);
  const outcome = mapOutcome(ai.outcome);
  const notes = String(ai.notes ?? raw).trim() || raw;
  const facility_name = String(ai.facility_name ?? input.selected_facility_name ?? "").trim() || null;

  const origin: GeoPoint | null =
    typeof input.current_latitude === "number" &&
    typeof input.current_longitude === "number" &&
    isValidGeoPoint({ latitude: input.current_latitude, longitude: input.current_longitude })
      ? { latitude: input.current_latitude, longitude: input.current_longitude }
      : null;

  const { data: facilityRows } = await input.supabase
    .from("facilities")
    .select("id, name, city, latitude, longitude")
    .eq("is_active", true)
    .limit(2000);

  const facilities = (facilityRows ?? []) as PortalFacilityRow[];
  const routeStops = (input.route_draft_stops ?? []).map((s) => ({
    facilityId: s.facilityId,
    name: s.name,
  }));

  const possible_matches = await scoreFacilityMatches(facilities, {
    extractedName: facility_name,
    selectedFacilityId: input.selected_facility_id ?? null,
    origin,
    routeDraftStops: routeStops,
  });

  let matched_facility_id = input.selected_facility_id ?? null;
  let matched_facility_name = input.selected_facility_name ?? null;
  let match_confidence = input.selected_facility_id ? 1 : 0;
  let match_reason: string | null = input.selected_facility_id ? "Selected by user" : null;

  if (!matched_facility_id && possible_matches.length > 0) {
    const top = possible_matches[0];
    if (top.match_confidence >= 0.8) {
      matched_facility_id = top.id;
      matched_facility_name = top.name;
      match_confidence = top.match_confidence;
      match_reason = top.match_reason;
    }
  }

  const confidence =
    typeof ai.confidence === "number" && Number.isFinite(ai.confidence)
      ? Math.max(0, Math.min(1, ai.confidence))
      : 0.5;

  if (match_confidence < 0.8 && !matched_facility_id) {
    warnings.push("AI is not sure which facility this belongs to. Please choose a facility.");
  }

  let next_follow_up_at = parseIsoDate(ai.next_follow_up_at);
  if (ai.next_follow_up_at && !next_follow_up_at) {
    warnings.push("Follow-up date needs confirmation.");
  }

  const referralDetected =
    Boolean(ai.referral_detected) ||
    outcome === "Referral Received" ||
    outcome === "Referral Sent" ||
    activity_type === "Referral Received";

  const referral_detection: FacilityReferralAiDetection | null = referralDetected
    ? {
        referral_detected: true,
        patient_first_name: String(ai.patient_first_name ?? "").trim() || null,
        patient_last_name: String(ai.patient_last_name ?? "").trim() || null,
        patient_phone: String(ai.patient_phone ?? "").trim() || null,
        patient_dob: String(ai.patient_dob ?? "").trim().slice(0, 10) || null,
        payer: String(ai.payer ?? "").trim() || null,
        service_needed: String(ai.service_needed ?? "").trim() || null,
        referral_notes: String(ai.referral_notes ?? "").trim() || null,
        should_create_referral_lead: Boolean(ai.should_create_referral_lead ?? referralDetected),
      }
    : null;

  const draft: FacilityAiCaptureDraft = {
    facility_name,
    matched_facility_id,
    matched_facility_name,
    match_confidence,
    match_reason,
    possible_matches,
    activity_type,
    outcome,
    notes,
    contact_name: String(ai.contact_name ?? "").trim() || null,
    contact_role: String(ai.contact_role ?? "").trim() || null,
    follow_up_task: String(ai.follow_up_task ?? "").trim() || null,
    next_follow_up_at,
    materials_dropped_off: Boolean(ai.materials_dropped_off),
    requested_packet: Boolean(ai.requested_packet),
    referral_process_captured: Boolean(ai.referral_process_captured),
    decision_maker_met: Boolean(ai.decision_maker_met),
    referral_potential: mapReferralPotential(ai.referral_potential),
    confidence,
    warnings,
    needs_user_confirmation: true,
    ai_summary: String(ai.ai_summary ?? "").trim() || notes.slice(0, 160),
    referral_detection,
  };

  if (outcome === "Left Materials") draft.materials_dropped_off = true;
  if (outcome === "Wants Packet Faxed") draft.requested_packet = true;
  if (outcome === "Met Decision Maker") draft.decision_maker_met = true;

  return { ok: true, draft };
}
