import type { FacilityDueBand } from "@/lib/crm/facility-territory-due";
import type { PacketRequestCard } from "@/lib/crm/facility-packet-types";

export type OutreachFacilityCard = {
  id: string;
  name: string;
  type: string | null;
  status: string;
  priority: string;
  city: string | null;
  address: string;
  phone: string | null;
  lastVisitAt: string | null;
  nextFollowUpAt: string | null;
  visitFrequency: string | null;
  assignedRepUserId: string | null;
  assignedRepLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  relationshipStrength: number | null;
  distanceMiles: number | null;
  distanceLabel: string | null;
  dueBand: FacilityDueBand;
  dueLabel: string;
  dueYmd: string | null;
  whyPriority: string | null;
  lastActivitySummary: string | null;
  lastActivityType: string | null;
  lastActivityOutcome: string | null;
  referralPotential: string | null;
  referralLeadsTotal?: number;
  referralLeadsConverted?: number;
  lastReferralAt?: string | null;
  referralPipelineOpen?: number;
  referralPipelineWaitingOrders?: number;
  referralPipelineConvertedMonth?: number;
  referralsNeedingInfo?: number;
  profileHints?: {
    best_contact_name: string | null;
    preferred_method: string | null;
    next_best_action: string | null;
    referral_potential: string | null;
  };
};

export type OutreachRecentActivity = {
  id: string;
  facilityId: string;
  facilityName: string;
  activityType: string;
  outcome: string | null;
  notes: string | null;
  activityAt: string;
  nextFollowUpAt: string | null;
  photoCount: number;
};

export type OutreachDashboardSummary = {
  due_today: number;
  overdue: number;
  not_visited: number;
  route_stops: number;
  logged_this_week: number;
};

export type OutreachDashboardData = {
  follow_ups_due: OutreachFacilityCard[];
  near_me: OutreachFacilityCard[];
  not_visited: OutreachFacilityCard[];
  high_priority: OutreachFacilityCard[];
  recent_activity: OutreachRecentActivity[];
  packet_requests_due: PacketRequestCard[];
  summary: OutreachDashboardSummary;
};

export type FacilityPickerResult = {
  id: string;
  name: string;
  type: string | null;
  city: string | null;
  address: string;
  phone: string | null;
  lastVisitAt: string | null;
};
