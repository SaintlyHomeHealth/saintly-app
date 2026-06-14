import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  addCalendarDaysToIsoDate,
  getCrmCalendarDateIsoFromInstant,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import { staffPrimaryLabel } from "@/lib/crm/crm-leads-table-helpers";
import type {
  ActivityTrendPoint,
  AgentPerformanceRow,
  AnalyticsSummaryCard,
  AtRiskFacilityRow,
  BreakdownRow,
  FacilityAnalyticsData,
  FacilityAnalyticsFilters,
  FacilityGrowthData,
  FacilityOutreachInsight,
  FollowUpDisciplineData,
  PhotoProofRow,
  WarmSourceRow,
} from "@/lib/crm/facility-analytics-types";
import type { FollowUpTaskRow } from "@/lib/crm/facility-follow-up-task-types";
import { effectiveTaskDueAt, effectiveTaskStatus } from "@/lib/crm/facility-follow-up-tasks";
import { IN_PERSON_QUICK_LOG_ACTIVITY_TYPES } from "@/lib/crm/facility-quick-log";
import { aggregatePrintedQrReferralStats, aggregateReferralAttributionForAnalytics, loadFacilityReferralCountsByFacility } from "@/lib/crm/facility-referral-lead";
import { aggregateSourceLinkAnalytics } from "@/lib/crm/facility-referral-source-links-admin";
import { loadReferralProfileIntelligenceRows } from "@/lib/crm/facility-referral-profile";
import {
  buildReferralPipelineAnalytics,
  emptyReferralPipelineAnalytics,
  listFacilityReferralPipeline,
} from "@/lib/crm/facility-referral-pipeline";
import { computeFacilityDueInfo } from "@/lib/crm/facility-territory-due";
import type { StaffProfile } from "@/lib/staff-profile";
import { isManagerOrHigher } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WARM_OUTCOMES = new Set([
  "Wants Packet Faxed",
  "Wants Email Info",
  "Asked to Follow Up",
  "Met Decision Maker",
  "Good Conversation",
  "Referral Sent",
]);

const WARM_POTENTIAL = new Set(["Warm", "Hot"]);

type FacilityRow = {
  id: string;
  name: string;
  type: string | null;
  city: string | null;
  priority: string;
  assigned_rep_user_id: string | null;
  created_at: string;
  source: string | null;
  google_place_id: string | null;
  imported_by_user_id: string | null;
  last_visit_at: string | null;
  next_follow_up_at: string | null;
  visit_frequency: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
};

type ActivityRow = {
  id: string;
  facility_id: string;
  staff_user_id: string | null;
  activity_type: string;
  outcome: string | null;
  notes: string | null;
  activity_at: string;
  next_follow_up_at: string | null;
  referral_potential: string | null;
  materials_dropped_off: boolean;
  requested_packet: boolean;
  decision_maker_met: boolean;
  ai_summary: string | null;
  ai_extracted_json: unknown;
};

type PhotoRow = {
  id: string;
  facility_id: string;
  activity_id: string | null;
  photo_type: string | null;
  ai_summary: string | null;
  uploaded_by: string | null;
  created_at: string;
};

function ymdBounds(startYmd: string, endYmd: string): { startIso: string; endIso: string } {
  return {
    startIso: `${startYmd.trim().slice(0, 10)}T00:00:00.000Z`,
    endIso: `${endYmd.trim().slice(0, 10)}T23:59:59.999Z`,
  };
}

function priorPeriod(startYmd: string, endYmd: string): { start: string; end: string } {
  const start = startYmd.slice(0, 10);
  const end = endYmd.slice(0, 10);
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  const startDate = new Date(Date.UTC(ys, ms - 1, ds));
  const endDate = new Date(Date.UTC(ye, me - 1, de));
  const days = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 86400000) + 1);
  const priorEnd = addCalendarDaysToIsoDate(start, -1);
  const priorStart = addCalendarDaysToIsoDate(priorEnd, -(days - 1));
  return { start: priorStart, end: priorEnd };
}

function changePct(current: number, prior: number): number | null {
  if (prior === 0) return current > 0 ? 100 : null;
  return Math.round(((current - prior) / prior) * 100);
}

function isInRange(iso: string, startIso: string, endIso: string): boolean {
  const t = new Date(iso).getTime();
  return t >= new Date(startIso).getTime() && t <= new Date(endIso).getTime();
}

function isWarmActivity(a: ActivityRow): boolean {
  if (a.activity_type === "Referral Received") return true;
  if (a.outcome && WARM_OUTCOMES.has(a.outcome)) return true;
  if (a.referral_potential && WARM_POTENTIAL.has(a.referral_potential)) return true;
  if (a.decision_maker_met) return true;
  if (a.requested_packet) return true;
  return false;
}

function warmthScore(a: ActivityRow): number {
  let s = 0;
  if (a.activity_type === "Referral Received") s += 10;
  if (a.referral_potential === "Hot") s += 8;
  else if (a.referral_potential === "Warm") s += 5;
  if (a.outcome === "Met Decision Maker") s += 6;
  if (a.outcome === "Wants Packet Faxed") s += 5;
  if (a.outcome === "Asked to Follow Up") s += 4;
  if (a.outcome === "Good Conversation") s += 3;
  if (a.decision_maker_met) s += 4;
  if (a.requested_packet) s += 4;
  return s;
}

function warmthReasons(a: ActivityRow): string[] {
  const r: string[] = [];
  if (a.activity_type === "Referral Received") r.push("Referral received");
  if (a.referral_potential === "Hot" || a.referral_potential === "Warm") {
    r.push(`${a.referral_potential} potential`);
  }
  if (a.outcome) r.push(a.outcome);
  if (a.decision_maker_met && !r.includes("Met Decision Maker")) r.push("Decision maker met");
  if (a.requested_packet) r.push("Packet requested");
  return r.slice(0, 4);
}

function staffLabelFromMap(
  userId: string | null,
  staffById: Record<string, { full_name: string | null; email: string | null; user_id: string }>
): string | null {
  if (!userId) return null;
  const s = staffById[userId];
  if (!s) return null;
  return staffPrimaryLabel(s);
}

function facilitySourceLabel(f: FacilityRow): string {
  if (f.source === "google_places" || f.google_place_id) return "Google Places";
  return "Manual";
}

export async function loadFacilityAnalytics(
  supabase: SupabaseClient,
  staff: StaffProfile,
  filters: FacilityAnalyticsFilters
): Promise<FacilityAnalyticsData> {
  const today = getCrmCalendarTodayIso();
  const { startIso, endIso } = ymdBounds(filters.startDate, filters.endDate);
  const prior = priorPeriod(filters.startDate, filters.endDate);
  const priorBounds = ymdBounds(prior.start, prior.end);

  const { data: staffRows } = await supabase
    .from("staff_profiles")
    .select("user_id, full_name, email");
  const staffById: Record<string, { full_name: string | null; email: string | null; user_id: string }> = {};
  for (const s of staffRows ?? []) {
    const row = s as { user_id: string; full_name: string | null; email: string | null };
    staffById[row.user_id] = row;
  }

  let facQuery = supabase
    .from("facilities")
    .select(
      "id, name, type, city, priority, status, assigned_rep_user_id, created_at, source, google_place_id, imported_at, imported_by_user_id, last_visit_at, next_follow_up_at, visit_frequency, latitude, longitude, is_active"
    )
    .limit(5000);

  if (filters.city) facQuery = facQuery.eq("city", filters.city);
  if (filters.facilityType) facQuery = facQuery.eq("type", filters.facilityType);
  if (filters.source === "google_places") {
    facQuery = facQuery.or("source.eq.google_places,google_place_id.not.is.null");
  } else if (filters.source === "manual") {
    facQuery = facQuery.is("google_place_id", null).or("source.is.null,source.eq.manual");
  }

  const canSeeAll = isManagerOrHigher(staff);
  if (!canSeeAll) {
    facQuery = facQuery.eq("assigned_rep_user_id", staff.user_id);
  } else if (filters.repId && UUID_RE.test(filters.repId)) {
    facQuery = facQuery.eq("assigned_rep_user_id", filters.repId);
  }

  const { data: facRows } = await facQuery;
  let facilities = (facRows ?? []) as FacilityRow[];
  facilities = facilities.filter((f) => f.is_active !== false);
  const facilityIds = new Set(facilities.map((f) => f.id));
  const facilityById: Record<string, FacilityRow> = {};
  for (const f of facilities) facilityById[f.id] = f;

  const actSelect =
    "id, facility_id, staff_user_id, activity_type, outcome, notes, activity_at, next_follow_up_at, referral_potential, materials_dropped_off, requested_packet, decision_maker_met, ai_summary, ai_extracted_json";

  const warmStart = ymdBounds(addCalendarDaysToIsoDate(filters.endDate, -90), filters.endDate).startIso;

  const [{ data: rangeActs }, { data: priorActs }, { data: allActsForWarm }] = await Promise.all([
    supabase
      .from("facility_activities")
      .select(actSelect)
      .gte("activity_at", startIso)
      .lte("activity_at", endIso)
      .order("activity_at", { ascending: false })
      .limit(8000),
    supabase
      .from("facility_activities")
      .select(actSelect)
      .gte("activity_at", priorBounds.startIso)
      .lte("activity_at", priorBounds.endIso)
      .limit(8000),
    supabase
      .from("facility_activities")
      .select(actSelect)
      .gte("activity_at", warmStart)
      .lte("activity_at", endIso)
      .order("activity_at", { ascending: false })
      .limit(8000),
  ]);

  function filterActivities(rows: ActivityRow[]): ActivityRow[] {
    return rows.filter((a) => {
      if (!facilityIds.has(a.facility_id)) return false;
      if (filters.repId && UUID_RE.test(filters.repId)) {
        const fac = facilityById[a.facility_id];
        if (a.staff_user_id !== filters.repId && fac?.assigned_rep_user_id !== filters.repId) return false;
      }
      return true;
    });
  }

  const activities = filterActivities((rangeActs ?? []) as ActivityRow[]);
  const priorActivities = filterActivities((priorActs ?? []) as ActivityRow[]);
  const warmActivities = filterActivities((allActsForWarm ?? []) as ActivityRow[]);

  const [{ data: taskRows }, { data: photoRows }, { data: contactRows }] = await Promise.all([
    supabase.from("facility_follow_up_tasks").select("*").limit(5000),
    supabase
      .from("facility_activity_photos")
      .select("id, facility_id, activity_id, photo_type, ai_summary, uploaded_by, created_at")
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("facility_contacts").select("facility_id").eq("is_active", true).limit(10000),
  ]);

  const tasks = ((taskRows ?? []) as FollowUpTaskRow[]).filter((t) => facilityIds.has(t.facility_id));
  const photos = ((photoRows ?? []) as PhotoRow[]).filter((p) => facilityIds.has(p.facility_id));
  const contactsByFacility: Record<string, number> = {};
  for (const c of contactRows ?? []) {
    const fid = (c as { facility_id: string }).facility_id;
    if (!facilityIds.has(fid)) continue;
    contactsByFacility[fid] = (contactsByFacility[fid] ?? 0) + 1;
  }

  const photosByFacility = new Set(photos.map((p) => p.facility_id));
  const allPhotosByFacility: Record<string, number> = {};
  if (facilityIds.size > 0) {
    const { data: allPhotoCounts } = await supabase
      .from("facility_activity_photos")
      .select("facility_id")
      .in("facility_id", [...facilityIds].slice(0, 500));
    for (const p of allPhotoCounts ?? []) {
      const fid = (p as { facility_id: string }).facility_id;
      allPhotosByFacility[fid] = (allPhotosByFacility[fid] ?? 0) + 1;
    }
  }

  const activityCountByFacility: Record<string, number> = {};
  for (const a of activities) {
    activityCountByFacility[a.facility_id] = (activityCountByFacility[a.facility_id] ?? 0) + 1;
  }

  const latestActivityByFacility: Record<string, ActivityRow> = {};
  for (const a of warmActivities) {
    if (!latestActivityByFacility[a.facility_id]) latestActivityByFacility[a.facility_id] = a;
  }

  const openTaskByFacility: Record<string, FollowUpTaskRow> = {};
  for (const t of tasks) {
    const eff = effectiveTaskStatus(t);
    if (eff !== "open" && eff !== "snoozed") continue;
    if (!openTaskByFacility[t.facility_id]) openTaskByFacility[t.facility_id] = t;
  }

  function countActs(rows: ActivityRow[], pred: (a: ActivityRow) => boolean): number {
    return rows.filter(pred).length;
  }

  const inPerson = (a: ActivityRow) => IN_PERSON_QUICK_LOG_ACTIVITY_TYPES.has(a.activity_type);
  const isPhone = (a: ActivityRow) => a.activity_type === "Phone Call" || a.activity_type === "Voicemail";
  const isAi = (a: ActivityRow) => Boolean(a.ai_summary || a.ai_extracted_json);
  const isReferral = (a: ActivityRow) =>
    a.activity_type === "Referral Received" || a.outcome === "Referral Sent";

  const facilitiesVisited = new Set(activities.filter(inPerson).map((a) => a.facility_id)).size;
  const priorFacilitiesVisited = new Set(priorActivities.filter(inPerson).map((a) => a.facility_id)).size;

  const newFacilities = facilities.filter((f) => isInRange(f.created_at, startIso, endIso)).length;
  const priorNewFacilities = facilities.filter((f) =>
    isInRange(f.created_at, priorBounds.startIso, priorBounds.endIso)
  ).length;

  const tasksCreated = tasks.filter((t) => isInRange(t.created_at, startIso, endIso)).length;
  const priorTasksCreated = tasks.filter((t) =>
    isInRange(t.created_at, priorBounds.startIso, priorBounds.endIso)
  ).length;

  const tasksCompleted = tasks.filter(
    (t) => t.status === "completed" && t.completed_at && isInRange(t.completed_at, startIso, endIso)
  ).length;
  const priorTasksCompleted = tasks.filter(
    (t) =>
      t.status === "completed" &&
      t.completed_at &&
      isInRange(t.completed_at, priorBounds.startIso, priorBounds.endIso)
  ).length;

  const overdueTasks = tasks.filter((t) => {
    const eff = effectiveTaskStatus(t);
    if (eff !== "open") return false;
    return getCrmCalendarDateIsoFromInstant(new Date(effectiveTaskDueAt(t))) < today;
  }).length;

  const warmHotFacilities = new Set(
    Object.entries(latestActivityByFacility)
      .filter(([, a]) => isWarmActivity(a))
      .map(([id]) => id)
  ).size;

  const staffByIdMap = new Map<string, { full_name: string | null; email: string | null }>();
  for (const [id, s] of Object.entries(staffById)) {
    staffByIdMap.set(id, { full_name: s.full_name, email: s.email });
  }

  const facilityMetaById: Record<
    string,
    { name: string; type: string | null; city: string | null; assigned_rep_user_id: string | null }
  > = {};
  for (const f of facilities) {
    facilityMetaById[f.id] = {
      name: f.name,
      type: f.type,
      city: f.city,
      assigned_rep_user_id: f.assigned_rep_user_id,
    };
  }

  let referralAttributionAgg;
  let printedQrStats = { total: 0, matched: 0, unmatched: 0 };
  let sourceLinkStats = { linksCreated: 0, tokenLeads: 0, tokenViews: 0, topLinks: [] as Array<{ linkId: string; label: string; leads: number; views: number }> };
  try {
    referralAttributionAgg = await aggregateReferralAttributionForAnalytics({
      startIso,
      endIso,
      repId: filters.repId,
      staffById: staffByIdMap,
      facilityById: facilityMetaById,
    });
    printedQrStats = await aggregatePrintedQrReferralStats({ startIso, endIso });
    sourceLinkStats = await aggregateSourceLinkAnalytics({ startIso, endIso });
  } catch (e) {
    console.warn("[facility-analytics] referral attribution:", e);
    referralAttributionAgg = {
      leadsCreated: 0,
      converted: 0,
      conversionRate: null,
      byFacility: [],
      byRep: [],
      byContact: [],
      byService: [],
      byPayer: [],
    };
  }

  const referralCountsByFacility = await loadFacilityReferralCountsByFacility([...facilityIds]);

  let referralPipeline = emptyReferralPipelineAnalytics();
  try {
    const pipelineResult = await listFacilityReferralPipeline(staff, {
      start_date: filters.startDate,
      end_date: filters.endDate,
      rep_id: filters.repId ?? null,
      city: filters.city ?? null,
    });
    referralPipeline = buildReferralPipelineAnalytics(
      pipelineResult.referrals,
      pipelineResult.pipeline_health
    );
  } catch (e) {
    console.warn("[facility-analytics] referral pipeline:", e);
  }

  let intakeReadiness: import("@/lib/crm/lead-intake-readiness-types").IntakeReadinessAnalytics | undefined;
  try {
    const { computeIntakeReadinessAnalytics } = await import("@/lib/crm/lead-intake-readiness");
    intakeReadiness = await computeIntakeReadinessAnalytics({
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
  } catch (e) {
    console.warn("[facility-analytics] intake readiness:", e);
  }

  let admissionHandoff: import("@/lib/crm/lead-admission-handoff-types").AdmissionHandoffAnalytics | undefined;
  try {
    const { computeAdmissionHandoffAnalytics } = await import("@/lib/crm/lead-admission-handoff");
    admissionHandoff = await computeAdmissionHandoffAnalytics({
      startDate: filters.startDate,
      endDate: filters.endDate,
    });
  } catch (e) {
    console.warn("[facility-analytics] admission handoff:", e);
  }

  const { loadPacketFulfillmentMetrics } = await import("@/lib/crm/facility-packet-requests");
  const packetFulfillment = await loadPacketFulfillmentMetrics(
    staff,
    filters.startDate,
    filters.endDate,
    filters.repId
  );

  const { loadRoutePerformanceMetrics, loadRouteRepPerformance } = await import("@/lib/crm/facility-route-plans");
  const routePerformance = await loadRoutePerformanceMetrics(
    staff,
    filters.startDate,
    filters.endDate,
    filters.repId
  );
  const routeRepStats = await loadRouteRepPerformance(staff, filters.startDate, filters.endDate);

  const summaryCards: AnalyticsSummaryCard[] = [
    { key: "activities", label: "Total activities logged", value: activities.length, priorValue: priorActivities.length, changePct: changePct(activities.length, priorActivities.length) },
    { key: "in_person", label: "In-person visits", value: countActs(activities, inPerson), priorValue: countActs(priorActivities, inPerson), changePct: changePct(countActs(activities, inPerson), countActs(priorActivities, inPerson)) },
    { key: "facilities_visited", label: "Facilities visited", value: facilitiesVisited, priorValue: priorFacilitiesVisited, changePct: changePct(facilitiesVisited, priorFacilitiesVisited) },
    { key: "new_facilities", label: "New facilities added", value: newFacilities, priorValue: priorNewFacilities, changePct: changePct(newFacilities, priorNewFacilities) },
    { key: "followups_created", label: "Follow-ups created", value: tasksCreated, priorValue: priorTasksCreated, changePct: changePct(tasksCreated, priorTasksCreated) },
    { key: "followups_completed", label: "Follow-ups completed", value: tasksCompleted, priorValue: priorTasksCompleted, changePct: changePct(tasksCompleted, priorTasksCompleted) },
    { key: "overdue_followups", label: "Overdue follow-ups", value: overdueTasks, priorValue: overdueTasks, changePct: null },
    { key: "materials", label: "Materials dropped", value: countActs(activities, (a) => a.materials_dropped_off), priorValue: countActs(priorActivities, (a) => a.materials_dropped_off), changePct: changePct(countActs(activities, (a) => a.materials_dropped_off), countActs(priorActivities, (a) => a.materials_dropped_off)) },
    { key: "packets", label: "Packet requests", value: countActs(activities, (a) => a.requested_packet), priorValue: countActs(priorActivities, (a) => a.requested_packet), changePct: changePct(countActs(activities, (a) => a.requested_packet), countActs(priorActivities, (a) => a.requested_packet)) },
    { key: "decision_makers", label: "Decision makers met", value: countActs(activities, (a) => a.decision_maker_met), priorValue: countActs(priorActivities, (a) => a.decision_maker_met), changePct: changePct(countActs(activities, (a) => a.decision_maker_met), countActs(priorActivities, (a) => a.decision_maker_met)) },
    { key: "warm_hot", label: "Warm / Hot facilities", value: warmHotFacilities, priorValue: warmHotFacilities, changePct: null },
    { key: "referrals", label: "Referrals received", value: countActs(activities, isReferral), priorValue: countActs(priorActivities, isReferral), changePct: changePct(countActs(activities, isReferral), countActs(priorActivities, isReferral)) },
    { key: "referral_leads", label: "Referral leads created", value: referralAttributionAgg.leadsCreated, priorValue: 0, changePct: null },
    { key: "referral_converted", label: "Converted referrals", value: referralAttributionAgg.converted, priorValue: 0, changePct: null },
    { key: "referral_conversion_rate", label: "Referral conversion rate", value: referralAttributionAgg.conversionRate ?? 0, priorValue: 0, changePct: null },
    { key: "printed_qr_total", label: "Universal QR referrals", value: printedQrStats.total, priorValue: 0, changePct: null },
    { key: "printed_qr_matched", label: "Matched printed QR", value: printedQrStats.matched, priorValue: 0, changePct: null },
    { key: "printed_qr_unmatched", label: "Unmatched printed QR", value: printedQrStats.unmatched, priorValue: 0, changePct: null },
    { key: "source_link_leads", label: "Campaign/rep QR leads", value: sourceLinkStats.tokenLeads, priorValue: 0, changePct: null },
    { key: "source_link_views", label: "Source link views", value: sourceLinkStats.tokenViews, priorValue: 0, changePct: null },
  ];

  const repIds = new Set<string>();
  for (const a of activities) if (a.staff_user_id) repIds.add(a.staff_user_id);
  for (const f of facilities) if (f.assigned_rep_user_id) repIds.add(f.assigned_rep_user_id);

  const photoCountByRep: Record<string, number> = {};
  for (const p of photos) {
    if (p.uploaded_by) photoCountByRep[p.uploaded_by] = (photoCountByRep[p.uploaded_by] ?? 0) + 1;
  }

  const agentPerformance: AgentPerformanceRow[] = [...repIds]
    .map((repUserId) => {
      const repActs = activities.filter((a) => a.staff_user_id === repUserId);
      const repFacilities = facilities.filter((f) => f.assigned_rep_user_id === repUserId);
      const repCompleted = tasks.filter(
        (t) =>
          t.completed_by === repUserId &&
          t.status === "completed" &&
          t.completed_at &&
          isInRange(t.completed_at, startIso, endIso)
      ).length;
      const repOverdue = tasks.filter((t) => {
        if (t.assigned_to !== repUserId) return false;
        const eff = effectiveTaskStatus(t);
        if (eff !== "open") return false;
        return getCrmCalendarDateIsoFromInstant(new Date(effectiveTaskDueAt(t))) < today;
      }).length;
      const lastAct = repActs.reduce<string | null>((best, a) => {
        if (!best || a.activity_at > best) return a.activity_at;
        return best;
      }, null);

      return {
        repUserId,
        repLabel: staffLabelFromMap(repUserId, staffById) ?? "Unknown",
        totalActivities: repActs.length,
        inPersonVisits: countActs(repActs, inPerson),
        phoneCalls: countActs(repActs, isPhone),
        aiCaptures: countActs(repActs, isAi),
        photoNotes: photoCountByRep[repUserId] ?? 0,
        facilitiesVisited: new Set(repActs.filter(inPerson).map((a) => a.facility_id)).size,
        newFacilitiesAdded: repFacilities.filter((f) => isInRange(f.created_at, startIso, endIso)).length,
        followUpsCompleted: repCompleted,
        overdueFollowUps: repOverdue,
        materialsDropped: countActs(repActs, (a) => a.materials_dropped_off),
        decisionMakersMet: countActs(repActs, (a) => a.decision_maker_met),
        referralsReceived: countActs(repActs, isReferral),
        routesCompleted: routeRepStats[repUserId]?.routesCompleted ?? 0,
        routeStopsCompleted: routeRepStats[repUserId]?.routeStopsCompleted ?? 0,
        routeCompletionRate:
          routeRepStats[repUserId]?.routeStopsTotal
            ? Math.round(
                ((routeRepStats[repUserId]?.routeStopsCompleted ?? 0) /
                  routeRepStats[repUserId]!.routeStopsTotal) *
                  100
              )
            : null,
        lastActivityAt: lastAct,
      };
    })
    .sort((a, b) => b.totalActivities - a.totalActivities);

  const trendMap: Record<string, ActivityTrendPoint> = {};
  let d = filters.startDate.slice(0, 10);
  const endD = filters.endDate.slice(0, 10);
  while (d <= endD) {
    trendMap[d] = { date: d, activities: 0, inPersonVisits: 0, followUpsCompleted: 0, materialsDropped: 0 };
    d = addCalendarDaysToIsoDate(d, 1);
  }
  for (const a of activities) {
    const ymd = getCrmCalendarDateIsoFromInstant(new Date(a.activity_at));
    if (!trendMap[ymd]) continue;
    trendMap[ymd].activities++;
    if (inPerson(a)) trendMap[ymd].inPersonVisits++;
    if (a.materials_dropped_off) trendMap[ymd].materialsDropped++;
  }
  for (const t of tasks) {
    if (t.status !== "completed" || !t.completed_at) continue;
    const ymd = getCrmCalendarDateIsoFromInstant(new Date(t.completed_at));
    if (trendMap[ymd]) trendMap[ymd].followUpsCompleted++;
  }
  const activityTrend = Object.values(trendMap).sort((a, b) => a.date.localeCompare(b.date));

  const warmSources: WarmSourceRow[] = Object.entries(latestActivityByFacility)
    .filter(([, a]) => isWarmActivity(a))
    .map(([facilityId, a]) => {
      const f = facilityById[facilityId];
      const task = openTaskByFacility[facilityId];
      const refStats = referralCountsByFacility.get(facilityId);
      const referralBonus = refStats?.total ? refStats.total * 4 : 0;
      return {
        facilityId,
        facilityName: f?.name ?? "Facility",
        facilityType: f?.type ?? null,
        city: f?.city ?? null,
        lastActivityAt: a.activity_at,
        lastOutcome: a.outcome,
        referralPotential: a.referral_potential,
        followUpTaskDue: task ? effectiveTaskDueAt(task) : f?.next_follow_up_at ?? null,
        followUpTaskTitle: task?.title ?? null,
        assignedRepLabel: staffLabelFromMap(f?.assigned_rep_user_id ?? null, staffById),
        warmthScore: warmthScore(a) + referralBonus,
        warmthReasons: [
          ...warmthReasons(a),
          ...(refStats?.total ? [`${refStats.total} referral lead${refStats.total === 1 ? "" : "s"}`] : []),
        ].slice(0, 4),
      };
    })
    .sort((a, b) => b.warmthScore - a.warmthScore)
    .slice(0, 50);

  const atRisk: AtRiskFacilityRow[] = [];
  const atRiskIds = new Set<string>();
  function pushAtRisk(f: FacilityRow, reason: string) {
    if (atRiskIds.has(f.id)) return;
    atRiskIds.add(f.id);
    const latest = latestActivityByFacility[f.id];
    atRisk.push({
      facilityId: f.id,
      facilityName: f.name,
      facilityType: f.type,
      city: f.city,
      reason,
      lastActivityAt: latest?.activity_at ?? f.last_visit_at,
      nextFollowUpAt: f.next_follow_up_at,
      assignedRepLabel: staffLabelFromMap(f.assigned_rep_user_id, staffById),
    });
  }

  const fourteenDaysAgo = addCalendarDaysToIsoDate(today, -14);
  for (const f of facilities) {
    const latest = latestActivityByFacility[f.id];
    if (f.priority === "High") {
      const lastYmd = f.last_visit_at
        ? getCrmCalendarDateIsoFromInstant(new Date(f.last_visit_at))
        : null;
      if (!lastYmd || lastYmd < fourteenDaysAgo) {
        pushAtRisk(f, "High priority — no visit in 14+ days");
      }
    }
    if (latest && isWarmActivity(latest)) {
      const due = computeFacilityDueInfo({
        last_visit_at: f.last_visit_at,
        next_follow_up_at: f.next_follow_up_at,
        visit_frequency: f.visit_frequency,
      });
      if (due.band === "overdue") pushAtRisk(f, "Warm/hot — follow-up overdue");
    }
    if (!f.last_visit_at && !latest) {
      const createdYmd = getCrmCalendarDateIsoFromInstant(new Date(f.created_at));
      if (createdYmd <= addCalendarDaysToIsoDate(today, -7)) {
        pushAtRisk(f, "No activity since being added");
      }
    }
    if (latest?.requested_packet && !openTaskByFacility[f.id]) {
      pushAtRisk(f, "Packet requested — no follow-up task");
    }
    const task = openTaskByFacility[f.id];
    if (task) {
      const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(effectiveTaskDueAt(task)));
      if (dueYmd < addCalendarDaysToIsoDate(today, -3)) {
        pushAtRisk(f, "Follow-up overdue 3+ days");
      }
    }
    if ((f.google_place_id || f.source === "google_places") && !f.last_visit_at && !latest) {
      pushAtRisk(f, "Google import — never visited");
    }
  }

  const photoProofRecent: PhotoProofRow[] = photos.slice(0, 24).map((p) => ({
    photoId: p.id,
    facilityId: p.facility_id,
    facilityName: facilityById[p.facility_id]?.name ?? "Facility",
    photoType: p.photo_type,
    aiSummary: p.ai_summary,
    uploadedByLabel: staffLabelFromMap(p.uploaded_by, staffById),
    uploadedAt: p.created_at,
    activityId: p.activity_id,
  }));

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  const disciplineCreated = tasks.filter((t) => isInRange(t.created_at, startIso, endIso)).length;
  const disciplineCompleted = tasks.filter(
    (t) => t.status === "completed" && t.completed_at && isInRange(t.completed_at, startIso, endIso)
  ).length;

  let overdueSumDays = 0;
  let overdueCount = 0;
  for (const t of tasks) {
    if (effectiveTaskStatus(t) !== "open") continue;
    const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(effectiveTaskDueAt(t)));
    if (dueYmd >= today) continue;
    overdueCount++;
    const dueDate = new Date(`${dueYmd}T12:00:00Z`);
    const todayDate = new Date(`${today}T12:00:00Z`);
    overdueSumDays += Math.max(0, Math.round((todayDate.getTime() - dueDate.getTime()) / 86400000));
  }

  const bySourceMap: Record<string, FollowUpDisciplineData["bySource"][number]> = {};
  for (const t of tasks) {
    const src = t.source ?? "unknown";
    if (!bySourceMap[src]) {
      bySourceMap[src] = { source: src, created: 0, completed: 0, snoozed: 0, canceled: 0, overdue: 0 };
    }
    if (isInRange(t.created_at, startIso, endIso)) bySourceMap[src].created++;
    if (t.status === "completed" && t.completed_at && isInRange(t.completed_at, startIso, endIso)) {
      bySourceMap[src].completed++;
    }
    if (t.status === "snoozed") bySourceMap[src].snoozed++;
    if (t.status === "canceled") bySourceMap[src].canceled++;
    if (effectiveTaskStatus(t) === "open") {
      const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(effectiveTaskDueAt(t)));
      if (dueYmd < today) bySourceMap[src].overdue++;
    }
  }

  const byRepMap: Record<string, { created: number; completed: number; overdue: number }> = {};
  for (const t of tasks) {
    const rep = t.assigned_to ?? t.created_by ?? "unassigned";
    if (!byRepMap[rep]) byRepMap[rep] = { created: 0, completed: 0, overdue: 0 };
    if (isInRange(t.created_at, startIso, endIso)) byRepMap[rep].created++;
    if (t.status === "completed" && t.completed_at && isInRange(t.completed_at, startIso, endIso)) {
      byRepMap[rep].completed++;
    }
    if (effectiveTaskStatus(t) === "open") {
      const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(effectiveTaskDueAt(t)));
      if (dueYmd < today) byRepMap[rep].overdue++;
    }
  }

  const followUpDiscipline: FollowUpDisciplineData = {
    created: disciplineCreated,
    completed: disciplineCompleted,
    snoozed: tasks.filter((t) => t.status === "snoozed").length,
    canceled: tasks.filter((t) => t.status === "canceled").length,
    overdue: overdueCount,
    completionRate:
      disciplineCreated > 0 ? Math.round((disciplineCompleted / disciplineCreated) * 100) : null,
    avgDaysOverdue: overdueCount > 0 ? Math.round((overdueSumDays / overdueCount) * 10) / 10 : null,
    completedThisWeek: tasks.filter(
      (t) =>
        t.status === "completed" &&
        t.completed_at &&
        new Date(t.completed_at).getTime() >= weekAgo.getTime()
    ).length,
    byRep: Object.entries(byRepMap).map(([repUserId, v]) => ({
      repLabel: staffLabelFromMap(repUserId === "unassigned" ? null : repUserId, staffById) ?? "Unassigned",
      ...v,
    })),
    bySource: Object.values(bySourceMap),
    recentTasks: tasks
      .filter((t) => effectiveTaskStatus(t) === "open" || t.status === "snoozed")
      .slice(0, 20)
      .map((t) => ({
        id: t.id,
        title: t.title,
        facilityId: t.facility_id,
        facilityName: facilityById[t.facility_id]?.name ?? "Facility",
        dueAt: effectiveTaskDueAt(t),
        status: effectiveTaskStatus(t),
        assignedRepLabel: staffLabelFromMap(t.assigned_to, staffById),
        source: t.source,
      })),
  };

  const newInRange = facilities
    .filter((f) => isInRange(f.created_at, startIso, endIso))
    .map((f) => ({
      facilityId: f.id,
      facilityName: f.name,
      source: facilitySourceLabel(f),
      addedByLabel: staffLabelFromMap(f.imported_by_user_id, staffById),
      addedAt: f.created_at,
      firstActivityStatus: warmActivities.some((a) => a.facility_id === f.id) ? "Logged" : "Not yet",
    }))
    .sort((a, b) => b.addedAt.localeCompare(a.addedAt))
    .slice(0, 30);

  const facilityGrowth: FacilityGrowthData = {
    totalFacilities: facilities.length,
    importedFromGoogle: facilities.filter((f) => f.google_place_id || f.source === "google_places").length,
    manuallyAdded: facilities.filter((f) => !f.google_place_id && f.source !== "google_places").length,
    noActivity: facilities.filter((f) => !f.last_visit_at && !activityCountByFacility[f.id]).length,
    withCoordinates: facilities.filter((f) => f.latitude != null && f.longitude != null).length,
    withContacts: Object.keys(contactsByFacility).length,
    withPhotos: Object.keys(allPhotosByFacility).length,
    withFollowUpTasks: new Set(tasks.map((t) => t.facility_id)).size,
    newInRange,
  };

  function buildBreakdown(groupKey: (f: FacilityRow) => string): BreakdownRow[] {
    const map: Record<string, BreakdownRow> = {};
    for (const f of facilities) {
      const label = groupKey(f) || "—";
      if (!map[label]) {
        map[label] = { label, facilities: 0, visited: 0, warm: 0, packetRequests: 0, overdueFollowUps: 0 };
      }
      map[label].facilities++;
      if (activityCountByFacility[f.id]) map[label].visited++;
      const latest = latestActivityByFacility[f.id];
      if (latest && isWarmActivity(latest)) map[label].warm++;
      if (latest?.requested_packet) map[label].packetRequests++;
      const task = openTaskByFacility[f.id];
      if (task && getCrmCalendarDateIsoFromInstant(new Date(effectiveTaskDueAt(task))) < today) {
        map[label].overdueFollowUps++;
      }
    }
    return Object.values(map).sort((a, b) => b.facilities - a.facilities).slice(0, 25);
  }

  const referralProfileIntelligence = await loadReferralProfileIntelligenceRows(40);

  let sourceReview: import("@/lib/crm/facility-referral-source-review-types").ReferralSourceReviewSummary = {
    pending: 0,
    reviewed: 0,
    matchedAfterReview: 0,
    facilitiesCreatedFromReview: 0,
    avgHoursToReview: null,
    topUnmatchedOfficeNames: [],
  };
  try {
    const { loadReferralSourceReviewSummary } = await import("@/lib/crm/facility-referral-source-review");
    sourceReview = await loadReferralSourceReviewSummary(staff);
  } catch (e) {
    console.warn("[facility-analytics] source review:", e);
  }

  return {
    filters,
    summary: summaryCards,
    agentPerformance,
    activityTrend,
    warmSources,
    atRiskFacilities: atRisk.slice(0, 50),
    photoProof: {
      photosUploaded: photos.length,
      businessCards: photos.filter((p) => p.photo_type === "business_card").length,
      swagBags: photos.filter((p) => p.photo_type === "swag_bag").length,
      postcards: photos.filter((p) => p.photo_type === "postcards").length,
      packetFaxRequests: photos.filter(
        (p) => p.photo_type === "fax_request" || p.photo_type === "referral_packet"
      ).length,
      facilitiesWithPhotos: photosByFacility.size,
      recent: photoProofRecent,
    },
    followUpDiscipline,
    facilityGrowth,
    breakdowns: {
      byType: buildBreakdown((f) => f.type ?? "Other"),
      byCity: buildBreakdown((f) => f.city ?? "Unknown"),
    },
    referralAttribution: {
      leadsCreated: referralAttributionAgg.leadsCreated,
      converted: referralAttributionAgg.converted,
      conversionRate: referralAttributionAgg.conversionRate,
      topProducingSources: referralAttributionAgg.byFacility,
      byRep: referralAttributionAgg.byRep,
      byContact: referralAttributionAgg.byContact,
      byService: referralAttributionAgg.byService,
      byPayer: referralAttributionAgg.byPayer,
      printedQr: printedQrStats,
      sourceLinks: sourceLinkStats,
    },
    sourceReview,
    referralPipeline,
    intakeReadiness,
    admissionHandoff,
    packetFulfillment,
    routePerformance,
    filterOptions: {
      cities: [...new Set(facilities.map((f) => f.city).filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b))
      ) as string[],
      types: [...new Set(facilities.map((f) => f.type).filter(Boolean))].sort((a, b) =>
        String(a).localeCompare(String(b))
      ) as string[],
      reps: [...repIds]
        .map((userId) => ({
          userId,
          label: staffLabelFromMap(userId, staffById) ?? userId,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    },
    referralProfileIntelligence,
  };
}

export async function loadFacilityOutreachInsight(
  supabase: SupabaseClient,
  facilityId: string
): Promise<FacilityOutreachInsight> {
  const [{ count: actCount }, { data: latestAct }, { count: photoCount }, { count: contactCount }, { count: openTasks }] =
    await Promise.all([
      supabase.from("facility_activities").select("id", { count: "exact", head: true }).eq("facility_id", facilityId),
      supabase
        .from("facility_activities")
        .select("outcome, referral_potential, activity_at")
        .eq("facility_id", facilityId)
        .order("activity_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("facility_activity_photos")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", facilityId),
      supabase
        .from("facility_contacts")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", facilityId)
        .eq("is_active", true),
      supabase
        .from("facility_follow_up_tasks")
        .select("id", { count: "exact", head: true })
        .eq("facility_id", facilityId)
        .in("status", ["open", "snoozed"]),
    ]);

  const { data: fac } = await supabase.from("facilities").select("last_visit_at").eq("id", facilityId).maybeSingle();
  const latest = latestAct as { outcome: string | null; referral_potential: string | null } | null;

  return {
    totalActivities: actCount ?? 0,
    lastVisitAt: (fac as { last_visit_at?: string | null } | null)?.last_visit_at ?? null,
    openFollowUpTasks: openTasks ?? 0,
    photosUploaded: photoCount ?? 0,
    contactsCount: contactCount ?? 0,
    referralPotential: latest?.referral_potential ?? null,
    lastOutcome: latest?.outcome ?? null,
  };
}

export type AnalyticsExportRow = {
  activityAt: string;
  facilityName: string;
  city: string | null;
  facilityType: string | null;
  repLabel: string | null;
  activityType: string;
  outcome: string | null;
  notes: string | null;
  nextFollowUpAt: string | null;
  materialsDropped: boolean;
  packetRequested: boolean;
  decisionMakerMet: boolean;
  referralPotential: string | null;
  photosCount: number;
};

export async function loadFacilityAnalyticsExportRows(
  supabase: SupabaseClient,
  staff: StaffProfile,
  filters: FacilityAnalyticsFilters
): Promise<AnalyticsExportRow[]> {
  const { startIso, endIso } = ymdBounds(filters.startDate, filters.endDate);

  let facQuery = supabase.from("facilities").select("id, name, city, type, assigned_rep_user_id").limit(5000);
  if (filters.city) facQuery = facQuery.eq("city", filters.city);
  if (filters.facilityType) facQuery = facQuery.eq("type", filters.facilityType);
  if (!isManagerOrHigher(staff)) facQuery = facQuery.eq("assigned_rep_user_id", staff.user_id);
  else if (filters.repId && UUID_RE.test(filters.repId)) {
    facQuery = facQuery.eq("assigned_rep_user_id", filters.repId);
  }

  const { data: facRows } = await facQuery;
  const facilityById: Record<
    string,
    { name: string; city: string | null; type: string | null; assigned_rep_user_id: string | null }
  > = {};
  for (const f of facRows ?? []) {
    const row = f as {
      id: string;
      name: string;
      city: string | null;
      type: string | null;
      assigned_rep_user_id: string | null;
    };
    facilityById[row.id] = row;
  }

  const { data: staffRows } = await supabase.from("staff_profiles").select("user_id, full_name, email");
  const staffById: Record<string, { full_name: string | null; email: string | null; user_id: string }> = {};
  for (const s of staffRows ?? []) {
    const row = s as { user_id: string; full_name: string | null; email: string | null };
    staffById[row.user_id] = row;
  }

  const { data: acts } = await supabase
    .from("facility_activities")
    .select(
      "id, facility_id, staff_user_id, activity_type, outcome, notes, activity_at, next_follow_up_at, materials_dropped_off, requested_packet, decision_maker_met, referral_potential"
    )
    .gte("activity_at", startIso)
    .lte("activity_at", endIso)
    .order("activity_at", { ascending: false })
    .limit(8000);

  const photoCounts: Record<string, number> = {};
  const { data: photoLinks } = await supabase
    .from("facility_activity_photos")
    .select("activity_id")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .limit(5000);
  for (const p of photoLinks ?? []) {
    const aid = (p as { activity_id: string | null }).activity_id;
    if (aid) photoCounts[aid] = (photoCounts[aid] ?? 0) + 1;
  }

  return ((acts ?? []) as ActivityRow[])
    .filter((a) => facilityById[a.facility_id])
    .map((a) => {
      const f = facilityById[a.facility_id];
      return {
        activityAt: a.activity_at,
        facilityName: f.name,
        city: f.city,
        facilityType: f.type,
        repLabel: staffLabelFromMap(a.staff_user_id, staffById),
        activityType: a.activity_type,
        outcome: a.outcome,
        notes: a.notes,
        nextFollowUpAt: a.next_follow_up_at,
        materialsDropped: a.materials_dropped_off,
        packetRequested: a.requested_packet,
        decisionMakerMet: a.decision_maker_met,
        referralPotential: a.referral_potential,
        photosCount: photoCounts[a.id] ?? 0,
      };
    });
}
