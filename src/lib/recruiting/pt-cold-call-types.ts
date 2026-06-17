/**
 * PT/PTA cold-calling record types (call targets + call logs) shared between API + UI.
 */

export type PtColdCallTargetRow = {
  id: string;
  created_at: string;
  updated_at: string;
  clinic_name: string;
  google_place_id: string | null;
  phone: string | null;
  normalized_phone: string | null;
  website: string | null;
  website_domain: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  latitude: number | null;
  longitude: number | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_maps_url: string | null;
  source: string;
  lead_category: string;
  pipeline: string;
  recruiting_type: string;
  discipline_target: string;
  status: string;
  contact_person: string | null;
  contact_title: string | null;
  recruiter_notes: string | null;
  call_attempts: number;
  last_called_at: string | null;
  next_follow_up_at: string | null;
  follow_up_reason: string | null;
  outcome: string | null;
  do_not_call: boolean;
  converted_candidate_id: string | null;
  created_by_user_id: string | null;
};

export type PtColdCallLogRow = {
  id: string;
  created_at: string;
  target_id: string;
  call_date: string | null;
  call_time: string | null;
  called_at: string;
  person_spoke_with: string | null;
  person_title: string | null;
  call_outcome: string | null;
  status_set: string | null;
  notes: string | null;
  next_follow_up_at: string | null;
  staff_user_id: string | null;
};

/** A saved target plus its most recent call log, for list cards. */
export type PtColdCallTargetWithLatest = PtColdCallTargetRow & {
  latest_log: PtColdCallLogRow | null;
};

export type PtColdCallDashboardCounts = {
  new: number;
  call_today: number;
  follow_up_due: number;
  interested: number;
  candidate: number;
  do_not_call: number;
  bad_number: number;
  not_interested: number;
  all: number;
};

/** Google Places search result enriched with PT-pipeline dedup info. */
export type PtColdCallSearchResult = {
  google_place_id: string;
  clinic_name: string;
  formatted_address: string;
  address_line_1: string;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  google_rating: number | null;
  google_review_count: number | null;
  google_maps_url: string;
  distance_miles: number | null;
  distance_label: string;
  // Dedup against existing PT cold-call targets.
  match_status: "new" | "already_in_pipeline" | "possible_match";
  matched_target_id: string | null;
  matched_target_name: string | null;
  matched_status: string | null;
  matched_last_called_at: string | null;
  matched_next_follow_up_at: string | null;
  matched_latest_note: string | null;
  match_reason: string;
};

export type PtColdCallSearchResponse = {
  results: PtColdCallSearchResult[];
  google_places_configured: boolean;
  normalized_query: {
    search_type: string;
    zip_code: string | null;
    radius_miles: number | null;
  };
  errors: string[];
};
