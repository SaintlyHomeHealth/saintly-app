export type ReferralSourceMatchCandidate = {
  facility_id: string;
  facility_name: string;
  city: string | null;
  confidence: number;
  reason: string;
};

export type ReferralSourceMatchResult = {
  matched_facility_id: string | null;
  matched_contact_id: string | null;
  confidence: number;
  match_reason: string;
  possible_matches: ReferralSourceMatchCandidate[];
};

export type ReferralSourceMatchInput = {
  referring_facility_name: string;
  referring_contact_name?: string | null;
  referring_contact_phone?: string | null;
  referring_contact_email?: string | null;
  referring_office_city?: string | null;
  referring_office_phone?: string | null;
};
