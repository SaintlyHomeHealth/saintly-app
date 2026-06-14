import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import {
  formatDistanceMiles,
  haversineDistanceMiles,
  isValidGeoPoint,
  type GeoPoint,
} from "@/lib/crm/facility-geolocation";
import {
  computeFacilityDueInfo,
  formatDueYmdAsDisplay,
  type FacilityDueBand,
} from "@/lib/crm/facility-territory-due";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { loadFacilityReferralCountsByFacility } from "@/lib/crm/facility-referral-lead";
import { loadFacilityReferralPipelineCounts } from "@/lib/crm/facility-referral-pipeline";
import { countReferralsNeedingInfoByFacilityIds } from "@/lib/crm/lead-intake-readiness";
import type { StaffProfile } from "@/lib/staff-profile";
import { isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";
import { loadOutreachPacketRequests } from "@/lib/crm/facility-packet-requests";
import type { PacketRequestCard } from "@/lib/crm/facility-packet-types";
import { loadProfileHintsForFacilities } from "@/lib/crm/facility-referral-profile";

import type {
  FacilityPickerResult,
  OutreachDashboardData,
  OutreachFacilityCard,
  OutreachRecentActivity,
} from "@/lib/crm/facility-outreach-types";

type FacilityRow = {
  id: string;
  name: string;
  type: string | null;
  status: string;
  priority: string;
  city: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  state: string | null;
  zip: string | null;
  main_phone: string | null;
  last_visit_at: string | null;
  next_follow_up_at: string | null;
  visit_frequency: string | null;
  assigned_rep_user_id: string | null;
  relationship_strength: number | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
};

type ActivityRow = {
  id: string;
  facility_id: string;
  activity_type: string;
  outcome: string | null;
  notes: string | null;
  activity_at: string;
  next_follow_up_at: string | null;
  referral_potential: string | null;
  staff_user_id: string | null;
};

const HIGH_PRIORITY_OUTCOMES = new Set([
  "Wants Packet Faxed",
  "Asked to Follow Up",
  "Met Decision Maker",
  "Good Conversation",
]);

const WARM_POTENTIAL = new Set(["Warm", "Hot"]);

function staffLabel(
  userId: string | null,
  staffById: Record<string, { full_name: string | null; email: string | null }>
): string | null {
  if (!userId) return null;
  const s = staffById[userId];
  if (!s) return null;
  const name = (s.full_name ?? "").trim();
  return name || (s.email ?? "").trim() || null;
}

function priorityRank(p: string): number {
  if (p === "High") return 0;
  if (p === "Medium") return 1;
  if (p === "Low") return 2;
  return 3;
}

function toCard(
  row: FacilityRow,
  staffById: Record<string, { full_name: string | null; email: string | null }>,
  origin: GeoPoint | null,
  latestActivity?: ActivityRow | null,
  referralStats?: { total: number; converted: number; lastReferralAt: string | null } | null,
  pipelineStats?: { open: number; waiting_orders: number; converted_month: number } | null,
  needingInfoCount?: number
): OutreachFacilityCard {
  const address = buildFacilityFullAddress(row);
  const due = computeFacilityDueInfo({
    last_visit_at: row.last_visit_at,
    next_follow_up_at: row.next_follow_up_at,
    visit_frequency: row.visit_frequency,
  });

  let distanceMiles: number | null = null;
  let distanceLabel: string | null = null;
  if (
    origin &&
    isValidGeoPoint({ latitude: row.latitude ?? NaN, longitude: row.longitude ?? NaN })
  ) {
    distanceMiles = haversineDistanceMiles(origin, {
      latitude: row.latitude!,
      longitude: row.longitude!,
    });
    distanceLabel = formatDistanceMiles(distanceMiles);
  }

  const notes = (latestActivity?.notes ?? "").trim();
  const summary = notes
    ? notes.length > 120
      ? `${notes.slice(0, 117)}…`
      : notes
    : latestActivity
      ? [latestActivity.activity_type, latestActivity.outcome].filter(Boolean).join(" · ")
      : null;

  return {
    id: row.id,
    name: row.name,
    type: row.type,
    status: row.status,
    priority: row.priority,
    city: row.city,
    address,
    phone: row.main_phone,
    lastVisitAt: row.last_visit_at,
    nextFollowUpAt: row.next_follow_up_at,
    visitFrequency: row.visit_frequency,
    assignedRepUserId: row.assigned_rep_user_id,
    assignedRepLabel: staffLabel(row.assigned_rep_user_id, staffById),
    latitude: row.latitude,
    longitude: row.longitude,
    relationshipStrength: row.relationship_strength,
    distanceMiles,
    distanceLabel,
    dueBand: due.band,
    dueLabel: formatDueYmdAsDisplay(due.effectiveNextDueYmd),
    dueYmd: due.effectiveNextDueYmd,
    whyPriority: null,
    lastActivitySummary: summary,
    lastActivityType: latestActivity?.activity_type ?? null,
    lastActivityOutcome: latestActivity?.outcome ?? null,
    referralPotential: latestActivity?.referral_potential ?? null,
    referralLeadsTotal: referralStats?.total ?? 0,
    referralLeadsConverted: referralStats?.converted ?? 0,
    lastReferralAt: referralStats?.lastReferralAt ?? null,
    referralPipelineOpen: pipelineStats?.open ?? 0,
    referralPipelineWaitingOrders: pipelineStats?.waiting_orders ?? 0,
    referralPipelineConvertedMonth: pipelineStats?.converted_month ?? 0,
    referralsNeedingInfo: needingInfoCount ?? 0,
  };
}

function isFollowUpDue(row: FacilityRow, today: string): boolean {
  const due = computeFacilityDueInfo({
    last_visit_at: row.last_visit_at,
    next_follow_up_at: row.next_follow_up_at,
    visit_frequency: row.visit_frequency,
  });
  if (!due.effectiveNextDueYmd) return false;
  return due.effectiveNextDueYmd <= today;
}

function followUpSortKey(row: FacilityRow, today: string): [number, number, number, string] {
  const due = computeFacilityDueInfo({
    last_visit_at: row.last_visit_at,
    next_follow_up_at: row.next_follow_up_at,
    visit_frequency: row.visit_frequency,
  });
  const ymd = due.effectiveNextDueYmd ?? "9999-99-99";
  const overdueFirst = ymd < today ? 0 : ymd === today ? 1 : 2;
  return [overdueFirst, priorityRank(row.priority), 0, ymd];
}

function buildWhyPriority(row: FacilityRow, act: ActivityRow | null): string {
  const reasons: string[] = [];
  if (row.priority === "High") reasons.push("High priority facility");
  if ((row.relationship_strength ?? 0) >= 4) reasons.push("Strong relationship");
  if (act?.referral_potential && WARM_POTENTIAL.has(act.referral_potential)) {
    reasons.push(`${act.referral_potential} referral potential`);
  }
  if (act?.outcome && HIGH_PRIORITY_OUTCOMES.has(act.outcome)) {
    reasons.push(act.outcome);
  }
  return reasons.join(" · ") || "High priority";
}

export async function loadOutreachDashboard(
  supabase: SupabaseClient,
  staff: StaffProfile,
  opts: {
    latitude?: number | null;
    longitude?: number | null;
    radiusMiles?: number;
  }
): Promise<OutreachDashboardData> {
  const today = getCrmCalendarTodayIso();
  const radius = opts.radiusMiles ?? 15;

  const origin: GeoPoint | null =
    typeof opts.latitude === "number" &&
    typeof opts.longitude === "number" &&
    isValidGeoPoint({ latitude: opts.latitude, longitude: opts.longitude })
      ? { latitude: opts.latitude, longitude: opts.longitude }
      : null;

  let facilityQuery = supabase
    .from("facilities")
    .select(
      "id, name, type, status, priority, city, address_line_1, address_line_2, state, zip, main_phone, last_visit_at, next_follow_up_at, visit_frequency, assigned_rep_user_id, relationship_strength, latitude, longitude, is_active"
    )
    .eq("is_active", true)
    .limit(2000);

  const scopeToRep = !isManagerOrHigher(staff) && !isAdminOrHigher(staff);
  if (scopeToRep) {
    facilityQuery = facilityQuery.eq("assigned_rep_user_id", staff.user_id);
  }

  const { data: facilityRows } = await facilityQuery;
  const facilities = (facilityRows ?? []) as FacilityRow[];

  const { data: staffRows } = await supabase
    .from("staff_profiles")
    .select("user_id, full_name, email");
  const staffById: Record<string, { full_name: string | null; email: string | null }> = {};
  for (const s of staffRows ?? []) {
    staffById[(s as { user_id: string }).user_id] = s as {
      full_name: string | null;
      email: string | null;
    };
  }

  const facilityIds = facilities.map((f) => f.id);
  const latestByFacility: Record<string, ActivityRow> = {};

  if (facilityIds.length > 0) {
    const { data: activityRows } = await supabase
      .from("facility_activities")
      .select(
        "id, facility_id, activity_type, outcome, notes, activity_at, next_follow_up_at, referral_potential, staff_user_id"
      )
      .in("facility_id", facilityIds)
      .order("activity_at", { ascending: false })
      .limit(5000);

    for (const raw of activityRows ?? []) {
      const a = raw as ActivityRow;
      if (!latestByFacility[a.facility_id]) {
        latestByFacility[a.facility_id] = a;
      }
    }
  }

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  let activityCountQuery = supabase
    .from("facility_activities")
    .select("id", { count: "exact", head: true })
    .gte("activity_at", weekAgo.toISOString());

  if (!isManagerOrHigher(staff) && !isAdminOrHigher(staff)) {
    activityCountQuery = activityCountQuery.eq("staff_user_id", staff.user_id);
  }
  const { count: loggedThisWeek } = await activityCountQuery;

  let recentQuery = supabase
    .from("facility_activities")
    .select(
      "id, facility_id, activity_type, outcome, notes, activity_at, next_follow_up_at, referral_potential, staff_user_id"
    )
    .order("activity_at", { ascending: false })
    .limit(30);

  if (!isManagerOrHigher(staff) && !isAdminOrHigher(staff)) {
    recentQuery = recentQuery.eq("staff_user_id", staff.user_id);
  }
  const { data: recentRows } = await recentQuery;
  const recentActivities = (recentRows ?? []) as ActivityRow[];

  const facilityNameById: Record<string, string> = {};
  for (const f of facilities) {
    facilityNameById[f.id] = f.name;
  }

  const recentActivityIds = recentActivities.map((a) => a.id);
  const photoCountByActivity: Record<string, number> = {};
  if (recentActivityIds.length > 0) {
    const { data: photoRows } = await supabase
      .from("facility_activity_photos")
      .select("id, activity_id")
      .in("activity_id", recentActivityIds);
    for (const p of photoRows ?? []) {
      const aid = (p as { activity_id: string }).activity_id;
      if (aid) photoCountByActivity[aid] = (photoCountByActivity[aid] ?? 0) + 1;
    }
  }

  const followUpRows = facilities
    .filter((f) => isFollowUpDue(f, today))
    .sort((a, b) => {
      const ka = followUpSortKey(a, today);
      const kb = followUpSortKey(b, today);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[3].localeCompare(kb[3]);
    });

  const notVisitedRows = facilities
    .filter((f) => !f.last_visit_at)
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        (a.city ?? "").localeCompare(b.city ?? "") ||
        a.name.localeCompare(b.name)
    );

  const highPriorityRows = facilities
    .filter((f) => {
      if (f.priority === "High") return true;
      if ((f.relationship_strength ?? 0) >= 4) return true;
      const act = latestByFacility[f.id];
      if (!act) return false;
      if (act.referral_potential && WARM_POTENTIAL.has(act.referral_potential)) return true;
      if (act.outcome && HIGH_PRIORITY_OUTCOMES.has(act.outcome)) return true;
      return false;
    })
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));

  let nearMeRows = facilities;
  if (origin) {
    nearMeRows = facilities
      .filter((f) =>
        isValidGeoPoint({ latitude: f.latitude ?? NaN, longitude: f.longitude ?? NaN })
      )
      .map((f) => ({
        row: f,
        dist: haversineDistanceMiles(origin, {
          latitude: f.latitude!,
          longitude: f.longitude!,
        }),
      }))
      .filter(({ dist }) => dist <= radius)
      .sort((a, b) => a.dist - b.dist)
      .map(({ row }) => row);
  } else {
    nearMeRows = [];
  }

  const overdueCount = followUpRows.filter((f) => {
    const due = computeFacilityDueInfo({
      last_visit_at: f.last_visit_at,
      next_follow_up_at: f.next_follow_up_at,
      visit_frequency: f.visit_frequency,
    });
    return due.band === "overdue";
  }).length;

  const dueTodayCount = followUpRows.filter((f) => {
    const due = computeFacilityDueInfo({
      last_visit_at: f.last_visit_at,
      next_follow_up_at: f.next_follow_up_at,
      visit_frequency: f.visit_frequency,
    });
    return due.effectiveNextDueYmd === today;
  }).length;

  const referralCounts = await loadFacilityReferralCountsByFacility(facilities.map((f) => f.id));
  const pipelineCounts = await loadFacilityReferralPipelineCounts(facilities.map((f) => f.id));
  const needingInfoCounts = await countReferralsNeedingInfoByFacilityIds(facilities.map((f) => f.id));

  const mapFollowUp = (f: FacilityRow) =>
    toCard(
      f,
      staffById,
      origin,
      latestByFacility[f.id] ?? null,
      referralCounts.get(f.id) ?? null,
      pipelineCounts.get(f.id) ?? null,
      needingInfoCounts.get(f.id) ?? 0
    );

  const mapHighPriority = (f: FacilityRow) => {
    const act = latestByFacility[f.id] ?? null;
    const card = toCard(
      f,
      staffById,
      origin,
      act,
      referralCounts.get(f.id) ?? null,
      pipelineCounts.get(f.id) ?? null,
      needingInfoCounts.get(f.id) ?? 0
    );
    card.whyPriority = buildWhyPriority(f, act);
    return card;
  };

  const allCards = [
    ...followUpRows.slice(0, 50).map(mapFollowUp),
    ...nearMeRows.slice(0, 20).map(mapFollowUp),
    ...notVisitedRows.slice(0, 50).map(mapFollowUp),
    ...highPriorityRows.slice(0, 30).map(mapHighPriority),
  ];
  const hintFacilityIds = [...new Set(allCards.map((c) => c.id))];
  const profileHints = await loadProfileHintsForFacilities(hintFacilityIds);
  const attachHints = (c: OutreachFacilityCard): OutreachFacilityCard => ({
    ...c,
    profileHints: profileHints[c.id] ?? undefined,
  });

  return {
    follow_ups_due: followUpRows.slice(0, 50).map(mapFollowUp).map(attachHints),
    near_me: nearMeRows.slice(0, 20).map(mapFollowUp).map(attachHints),
    not_visited: notVisitedRows.slice(0, 50).map(mapFollowUp).map(attachHints),
    high_priority: highPriorityRows.slice(0, 30).map(mapHighPriority).map(attachHints),
    recent_activity: recentActivities.slice(0, 20).map((a) => ({
      id: a.id,
      facilityId: a.facility_id,
      facilityName: facilityNameById[a.facility_id] ?? "Facility",
      activityType: a.activity_type,
      outcome: a.outcome,
      notes: a.notes,
      activityAt: a.activity_at,
      nextFollowUpAt: a.next_follow_up_at,
      photoCount: photoCountByActivity[a.id] ?? 0,
    })),
    packet_requests_due: await loadOutreachPacketRequests(staff),
    summary: {
      due_today: dueTodayCount,
      overdue: overdueCount,
      not_visited: notVisitedRows.length,
      route_stops: 0,
      logged_this_week: loggedThisWeek ?? 0,
    },
  };
}

export type { FacilityPickerResult } from "@/lib/crm/facility-outreach-types";
export type {
  OutreachDashboardData,
  OutreachFacilityCard,
  OutreachRecentActivity,
} from "@/lib/crm/facility-outreach-types";

export async function searchFacilitiesForPicker(
  supabase: SupabaseClient,
  staff: StaffProfile,
  query: string
): Promise<FacilityPickerResult[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];

  let facilityQuery = supabase
    .from("facilities")
    .select(
      "id, name, type, city, address_line_1, address_line_2, state, zip, main_phone, last_visit_at, assigned_rep_user_id"
    )
    .eq("is_active", true)
    .limit(500);

  if (!isManagerOrHigher(staff) && !isAdminOrHigher(staff)) {
    facilityQuery = facilityQuery.eq("assigned_rep_user_id", staff.user_id);
  }

  const { data: rows } = await facilityQuery;
  const facilities = (rows ?? []) as FacilityRow[];

  const { data: contactRows } = await supabase
    .from("facility_contacts")
    .select("facility_id, full_name, first_name, last_name, email, direct_phone")
    .eq("is_active", true)
    .limit(3000);

  const contactsByFacility: Record<string, string[]> = {};
  for (const c of contactRows ?? []) {
    const row = c as {
      facility_id: string;
      full_name: string | null;
      first_name: string | null;
      last_name: string | null;
      email: string | null;
      direct_phone: string | null;
    };
    const name =
      (row.full_name ?? "").trim() ||
      [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
    const blob = [name, row.email, row.direct_phone].filter(Boolean).join(" ").toLowerCase();
    if (!contactsByFacility[row.facility_id]) contactsByFacility[row.facility_id] = [];
    if (blob) contactsByFacility[row.facility_id].push(blob);
  }

  const matched = facilities.filter((f) => {
    const hay = [
      f.name,
      f.type,
      f.city,
      f.main_phone,
      f.address_line_1,
      f.zip,
      ...(contactsByFacility[f.id] ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return matched.slice(0, 25).map((f) => ({
    id: f.id,
    name: f.name,
    type: f.type,
    city: f.city,
    address: buildFacilityFullAddress(f),
    phone: f.main_phone,
    lastVisitAt: f.last_visit_at,
  }));
}
