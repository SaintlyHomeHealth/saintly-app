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
  OutreachSectionId,
  OutreachSectionPage,
  OutreachSummaryData,
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

const FACILITY_CARD_SELECT =
  "id, name, type, status, priority, city, address_line_1, address_line_2, state, zip, main_phone, last_visit_at, next_follow_up_at, visit_frequency, assigned_rep_user_id, relationship_strength, latitude, longitude, is_active";

const ACTIVITY_SELECT =
  "id, facility_id, activity_type, outcome, notes, activity_at, next_follow_up_at, referral_potential, staff_user_id";

async function loadScopedFacilities(
  supabase: SupabaseClient,
  staff: StaffProfile
): Promise<FacilityRow[]> {
  let facilityQuery = supabase
    .from("facilities")
    .select(FACILITY_CARD_SELECT)
    .eq("is_active", true)
    .limit(2000);

  const scopeToRep = !isManagerOrHigher(staff) && !isAdminOrHigher(staff);
  if (scopeToRep) {
    facilityQuery = facilityQuery.eq("assigned_rep_user_id", staff.user_id);
  }

  const { data: facilityRows } = await facilityQuery;
  return (facilityRows ?? []) as FacilityRow[];
}

async function loadStaffById(
  supabase: SupabaseClient
): Promise<Record<string, { full_name: string | null; email: string | null }>> {
  const { data: staffRows } = await supabase.from("staff_profiles").select("user_id, full_name, email");
  const staffById: Record<string, { full_name: string | null; email: string | null }> = {};
  for (const s of staffRows ?? []) {
    staffById[(s as { user_id: string }).user_id] = s as {
      full_name: string | null;
      email: string | null;
    };
  }
  return staffById;
}

async function loadLatestActivityForFacilities(
  supabase: SupabaseClient,
  facilityIds: string[]
): Promise<Record<string, ActivityRow>> {
  const latestByFacility: Record<string, ActivityRow> = {};
  if (facilityIds.length === 0) return latestByFacility;

  const { data: activityRows } = await supabase
    .from("facility_activities")
    .select(ACTIVITY_SELECT)
    .in("facility_id", facilityIds)
    .order("activity_at", { ascending: false })
    .limit(Math.min(facilityIds.length * 3, 500));

  for (const raw of activityRows ?? []) {
    const a = raw as ActivityRow;
    if (!latestByFacility[a.facility_id]) {
      latestByFacility[a.facility_id] = a;
    }
  }
  return latestByFacility;
}

async function loadWarmActivityFacilityIds(
  supabase: SupabaseClient,
  staff: StaffProfile
): Promise<Set<string>> {
  let query = supabase
    .from("facility_activities")
    .select("facility_id, outcome, referral_potential, activity_at")
    .order("activity_at", { ascending: false })
    .limit(500);

  if (!isManagerOrHigher(staff) && !isAdminOrHigher(staff)) {
    query = query.eq("staff_user_id", staff.user_id);
  }

  const { data: rows } = await query;
  const ids = new Set<string>();
  for (const raw of rows ?? []) {
    const a = raw as {
      facility_id: string;
      outcome: string | null;
      referral_potential: string | null;
    };
    if (a.referral_potential && WARM_POTENTIAL.has(a.referral_potential)) {
      ids.add(a.facility_id);
      continue;
    }
    if (a.outcome && HIGH_PRIORITY_OUTCOMES.has(a.outcome)) {
      ids.add(a.facility_id);
    }
  }
  return ids;
}

function filterFollowUpRows(facilities: FacilityRow[], today: string): FacilityRow[] {
  return facilities
    .filter((f) => isFollowUpDue(f, today))
    .sort((a, b) => {
      const ka = followUpSortKey(a, today);
      const kb = followUpSortKey(b, today);
      return ka[0] - kb[0] || ka[1] - kb[1] || ka[3].localeCompare(kb[3]);
    });
}

function filterNotVisitedRows(facilities: FacilityRow[]): FacilityRow[] {
  return facilities
    .filter((f) => !f.last_visit_at)
    .sort(
      (a, b) =>
        priorityRank(a.priority) - priorityRank(b.priority) ||
        (a.city ?? "").localeCompare(b.city ?? "") ||
        a.name.localeCompare(b.name)
    );
}

function filterNearMeRows(
  facilities: FacilityRow[],
  origin: GeoPoint | null,
  radius: number
): FacilityRow[] {
  if (!origin) return [];
  return facilities
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
}

function filterHighPriorityRows(
  facilities: FacilityRow[],
  latestByFacility: Record<string, ActivityRow>,
  warmActivityIds: Set<string>
): FacilityRow[] {
  return facilities
    .filter((f) => {
      if (f.priority === "High") return true;
      if ((f.relationship_strength ?? 0) >= 4) return true;
      if (warmActivityIds.has(f.id)) return true;
      const act = latestByFacility[f.id];
      if (!act) return false;
      if (act.referral_potential && WARM_POTENTIAL.has(act.referral_potential)) return true;
      if (act.outcome && HIGH_PRIORITY_OUTCOMES.has(act.outcome)) return true;
      return false;
    })
    .sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
}

async function enrichFacilityCards(
  supabase: SupabaseClient,
  rows: FacilityRow[],
  staffById: Record<string, { full_name: string | null; email: string | null }>,
  origin: GeoPoint | null,
  opts?: { withWhyPriority?: boolean }
): Promise<OutreachFacilityCard[]> {
  if (rows.length === 0) return [];

  const ids = rows.map((f) => f.id);
  const [latestByFacility, referralCounts, pipelineCounts, needingInfoCounts, profileHints] =
    await Promise.all([
      loadLatestActivityForFacilities(supabase, ids),
      loadFacilityReferralCountsByFacility(ids),
      loadFacilityReferralPipelineCounts(ids),
      countReferralsNeedingInfoByFacilityIds(ids),
      loadProfileHintsForFacilities(ids),
    ]);

  return rows.map((f) => {
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
    if (opts?.withWhyPriority) {
      card.whyPriority = buildWhyPriority(f, act);
    }
    card.profileHints = profileHints[f.id] ?? undefined;
    return card;
  });
}

export async function loadOutreachSummary(
  supabase: SupabaseClient,
  staff: StaffProfile,
  opts: {
    latitude?: number | null;
    longitude?: number | null;
    radiusMiles?: number;
  } = {}
): Promise<OutreachSummaryData> {
  const today = getCrmCalendarTodayIso();
  const radius = opts.radiusMiles ?? 15;
  const origin: GeoPoint | null =
    typeof opts.latitude === "number" &&
    typeof opts.longitude === "number" &&
    isValidGeoPoint({ latitude: opts.latitude, longitude: opts.longitude })
      ? { latitude: opts.latitude, longitude: opts.longitude }
      : null;

  const [facilities, warmActivityIds] = await Promise.all([
    loadScopedFacilities(supabase, staff),
    loadWarmActivityFacilityIds(supabase, staff),
  ]);

  const followUpRows = filterFollowUpRows(facilities, today);
  const notVisitedRows = filterNotVisitedRows(facilities);
  const nearMeRows = filterNearMeRows(facilities, origin, radius);
  const highPriorityRows = filterHighPriorityRows(facilities, {}, warmActivityIds);

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

  let recentCountQuery = supabase
    .from("facility_activities")
    .select("id", { count: "exact", head: true });

  if (!isManagerOrHigher(staff) && !isAdminOrHigher(staff)) {
    recentCountQuery = recentCountQuery.eq("staff_user_id", staff.user_id);
  }
  const { count: recentActivityCount } = await recentCountQuery;

  const packetRequests = await loadOutreachPacketRequests(staff);

  return {
    due_today: dueTodayCount,
    overdue: overdueCount,
    not_visited: notVisitedRows.length,
    route_stops: 0,
    logged_this_week: loggedThisWeek ?? 0,
    section_counts: {
      follow_ups_due: followUpRows.length,
      near_me: nearMeRows.length,
      not_visited: notVisitedRows.length,
      high_priority: highPriorityRows.length,
      recent_activity: recentActivityCount ?? 0,
      packet_requests_due: packetRequests.length,
    },
  };
}

export async function loadOutreachSection(
  supabase: SupabaseClient,
  staff: StaffProfile,
  section: OutreachSectionId,
  opts: {
    limit?: number;
    offset?: number;
    latitude?: number | null;
    longitude?: number | null;
    radiusMiles?: number;
  } = {}
): Promise<
  OutreachSectionPage<OutreachFacilityCard> | OutreachSectionPage<OutreachRecentActivity> | OutreachSectionPage<PacketRequestCard>
> {
  const limit = Math.min(Math.max(opts.limit ?? 15, 1), 50);
  const offset = Math.max(opts.offset ?? 0, 0);
  const today = getCrmCalendarTodayIso();
  const radius = opts.radiusMiles ?? 15;
  const origin: GeoPoint | null =
    typeof opts.latitude === "number" &&
    typeof opts.longitude === "number" &&
    isValidGeoPoint({ latitude: opts.latitude, longitude: opts.longitude })
      ? { latitude: opts.latitude, longitude: opts.longitude }
      : null;

  if (section === "packet_requests_due") {
    const all = await loadOutreachPacketRequests(staff);
    const items = all.slice(offset, offset + limit);
    return { items, total: all.length, has_more: offset + items.length < all.length };
  }

  if (section === "recent_activity") {
    let recentQuery = supabase
      .from("facility_activities")
      .select(ACTIVITY_SELECT)
      .order("activity_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!isManagerOrHigher(staff) && !isAdminOrHigher(staff)) {
      recentQuery = recentQuery.eq("staff_user_id", staff.user_id);
    }

    let countQuery = supabase.from("facility_activities").select("id", { count: "exact", head: true });
    if (!isManagerOrHigher(staff) && !isAdminOrHigher(staff)) {
      countQuery = countQuery.eq("staff_user_id", staff.user_id);
    }

    const [{ data: recentRows }, { count: total }] = await Promise.all([recentQuery, countQuery]);
    const recentActivities = (recentRows ?? []) as ActivityRow[];
    const facilityIds = [...new Set(recentActivities.map((a) => a.facility_id))];

    const [{ data: facilityRows }, photoCountByActivity] = await Promise.all([
      facilityIds.length > 0
        ? supabase.from("facilities").select("id, name").in("id", facilityIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      (async () => {
        const recentActivityIds = recentActivities.map((a) => a.id);
        const out: Record<string, number> = {};
        if (recentActivityIds.length === 0) return out;
        const { data: photoRows } = await supabase
          .from("facility_activity_photos")
          .select("id, activity_id")
          .in("activity_id", recentActivityIds);
        for (const p of photoRows ?? []) {
          const aid = (p as { activity_id: string }).activity_id;
          if (aid) out[aid] = (out[aid] ?? 0) + 1;
        }
        return out;
      })(),
    ]);

    const facilityNameById: Record<string, string> = {};
    for (const f of facilityRows ?? []) {
      facilityNameById[(f as { id: string }).id] = (f as { name: string }).name;
    }

    const items: OutreachRecentActivity[] = recentActivities.map((a) => ({
      id: a.id,
      facilityId: a.facility_id,
      facilityName: facilityNameById[a.facility_id] ?? "Facility",
      activityType: a.activity_type,
      outcome: a.outcome,
      notes: a.notes,
      activityAt: a.activity_at,
      nextFollowUpAt: a.next_follow_up_at,
      photoCount: photoCountByActivity[a.id] ?? 0,
    }));

    return {
      items,
      total: total ?? items.length,
      has_more: offset + items.length < (total ?? 0),
    };
  }

  const [facilities, staffById, warmActivityIds] = await Promise.all([
    loadScopedFacilities(supabase, staff),
    loadStaffById(supabase),
    section === "high_priority" ? loadWarmActivityFacilityIds(supabase, staff) : Promise.resolve(new Set<string>()),
  ]);

  let matched: FacilityRow[] = [];
  if (section === "follow_ups_due") {
    matched = filterFollowUpRows(facilities, today);
  } else if (section === "not_visited") {
    matched = filterNotVisitedRows(facilities);
  } else if (section === "near_me") {
    matched = filterNearMeRows(facilities, origin, radius);
  } else if (section === "high_priority") {
    const candidateIds = new Set<string>();
    for (const f of facilities) {
      if (f.priority === "High" || (f.relationship_strength ?? 0) >= 4 || warmActivityIds.has(f.id)) {
        candidateIds.add(f.id);
      }
    }
    const candidates = facilities.filter((f) => candidateIds.has(f.id));
    const latestByFacility = await loadLatestActivityForFacilities(
      supabase,
      candidates.map((f) => f.id)
    );
    matched = filterHighPriorityRows(facilities, latestByFacility, warmActivityIds);
  }

  const pageRows = matched.slice(offset, offset + limit);
  const items = await enrichFacilityCards(supabase, pageRows, staffById, origin, {
    withWhyPriority: section === "high_priority",
  });

  return {
    items,
    total: matched.length,
    has_more: offset + items.length < matched.length,
  };
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
  const summary = await loadOutreachSummary(supabase, staff, opts);
  const [followUps, nearMe, notVisited, highPriority, recent, packets] = await Promise.all([
    loadOutreachSection(supabase, staff, "follow_ups_due", { ...opts, limit: 50, offset: 0 }),
    loadOutreachSection(supabase, staff, "near_me", { ...opts, limit: 20, offset: 0 }),
    loadOutreachSection(supabase, staff, "not_visited", { ...opts, limit: 50, offset: 0 }),
    loadOutreachSection(supabase, staff, "high_priority", { ...opts, limit: 30, offset: 0 }),
    loadOutreachSection(supabase, staff, "recent_activity", { ...opts, limit: 20, offset: 0 }),
    loadOutreachSection(supabase, staff, "packet_requests_due", { limit: 50, offset: 0 }),
  ]);

  return {
    follow_ups_due: followUps.items as OutreachFacilityCard[],
    near_me: nearMe.items as OutreachFacilityCard[],
    not_visited: notVisited.items as OutreachFacilityCard[],
    high_priority: highPriority.items as OutreachFacilityCard[],
    recent_activity: recent.items as OutreachRecentActivity[],
    packet_requests_due: packets.items as PacketRequestCard[],
    summary: {
      due_today: summary.due_today,
      overdue: summary.overdue,
      not_visited: summary.not_visited,
      route_stops: summary.route_stops,
      logged_this_week: summary.logged_this_week,
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
