import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { staffLabelFromLookup } from "@/lib/crm/crm-leads-table-helpers";
import type {
  CreateRoutePlanInput,
  RoutePerformanceSummary,
  RoutePlanCard,
  RoutePlanDetail,
  RoutePlanRow,
  RoutePlanStatus,
  RouteStopCard,
  RouteStopRow,
  RouteStopStatus,
} from "@/lib/crm/facility-route-types";
import {
  createFacilityNotification,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import type { StaffProfile } from "@/lib/staff-profile";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function mapPlanRow(raw: Record<string, unknown>): RoutePlanRow {
  return {
    id: String(raw.id),
    name: String(raw.name),
    route_date: String(raw.route_date).slice(0, 10),
    assigned_rep_id: typeof raw.assigned_rep_id === "string" ? raw.assigned_rep_id : null,
    created_by: typeof raw.created_by === "string" ? raw.created_by : null,
    status: (raw.status as RoutePlanStatus) ?? "draft",
    start_latitude: typeof raw.start_latitude === "number" ? raw.start_latitude : null,
    start_longitude: typeof raw.start_longitude === "number" ? raw.start_longitude : null,
    start_address: typeof raw.start_address === "string" ? raw.start_address : null,
    started_at: typeof raw.started_at === "string" ? raw.started_at : null,
    completed_at: typeof raw.completed_at === "string" ? raw.completed_at : null,
    completed_by: typeof raw.completed_by === "string" ? raw.completed_by : null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

function mapStopRow(raw: Record<string, unknown>): RouteStopRow {
  return {
    id: String(raw.id),
    route_plan_id: String(raw.route_plan_id),
    stop_order: Number(raw.stop_order),
    facility_id: typeof raw.facility_id === "string" ? raw.facility_id : null,
    google_place_id: typeof raw.google_place_id === "string" ? raw.google_place_id : null,
    name: String(raw.name),
    address: typeof raw.address === "string" ? raw.address : null,
    phone: typeof raw.phone === "string" ? raw.phone : null,
    latitude: typeof raw.latitude === "number" ? raw.latitude : null,
    longitude: typeof raw.longitude === "number" ? raw.longitude : null,
    source: typeof raw.source === "string" ? raw.source : null,
    portal_status: typeof raw.portal_status === "string" ? raw.portal_status : null,
    status: (raw.status as RouteStopStatus) ?? "pending",
    planned_arrival_at: typeof raw.planned_arrival_at === "string" ? raw.planned_arrival_at : null,
    checked_in_at: typeof raw.checked_in_at === "string" ? raw.checked_in_at : null,
    checked_in_latitude: typeof raw.checked_in_latitude === "number" ? raw.checked_in_latitude : null,
    checked_in_longitude: typeof raw.checked_in_longitude === "number" ? raw.checked_in_longitude : null,
    checked_out_at: typeof raw.checked_out_at === "string" ? raw.checked_out_at : null,
    completed_at: typeof raw.completed_at === "string" ? raw.completed_at : null,
    skipped_at: typeof raw.skipped_at === "string" ? raw.skipped_at : null,
    skip_reason: typeof raw.skip_reason === "string" ? raw.skip_reason : null,
    linked_activity_id: typeof raw.linked_activity_id === "string" ? raw.linked_activity_id : null,
    linked_photo_id: typeof raw.linked_photo_id === "string" ? raw.linked_photo_id : null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

async function staffLookup() {
  const { data } = await supabaseAdmin.from("staff_profiles").select("user_id, full_name, email");
  const byId: Record<string, { full_name: string | null; email: string | null }> = {};
  for (const s of data ?? []) {
    byId[(s as { user_id: string }).user_id] = s as { full_name: string | null; email: string | null };
  }
  return byId;
}

export function canViewRoutePlan(staff: StaffProfile, plan: RoutePlanRow): boolean {
  if (!canAccessFacilityFieldTools(staff)) return false;
  if (canAccessFacilityAdminTools(staff)) return true;
  return plan.assigned_rep_id === staff.user_id || plan.created_by === staff.user_id;
}

export function canMutateRoutePlan(staff: StaffProfile, plan: RoutePlanRow): boolean {
  return canViewRoutePlan(staff, plan);
}

async function loadPlanForStaff(staff: StaffProfile, routeId: string): Promise<RoutePlanRow | null> {
  if (!UUID_RE.test(routeId)) return null;
  const { data } = await supabaseAdmin.from("facility_route_plans").select("*").eq("id", routeId).maybeSingle();
  if (!data) return null;
  const row = mapPlanRow(data as Record<string, unknown>);
  if (!canViewRoutePlan(staff, row)) return null;
  return row;
}

async function enrichPlanCards(plans: RoutePlanRow[]): Promise<RoutePlanCard[]> {
  if (!plans.length) return [];
  const staffById = await staffLookup();
  const ids = plans.map((p) => p.id);
  const { data: stops } = await supabaseAdmin.from("facility_route_stops").select("route_plan_id, status").in("route_plan_id", ids);

  const counts: Record<string, { total: number; pending: number; completed: number; skipped: number; checked_in: number }> = {};
  for (const id of ids) counts[id] = { total: 0, pending: 0, completed: 0, skipped: 0, checked_in: 0 };
  for (const s of stops ?? []) {
    const rid = String((s as { route_plan_id: string }).route_plan_id);
    const status = String((s as { status: string }).status);
    if (!counts[rid]) continue;
    counts[rid].total++;
    if (status === "pending") counts[rid].pending++;
    if (status === "completed") counts[rid].completed++;
    if (status === "skipped") counts[rid].skipped++;
    if (status === "checked_in") counts[rid].checked_in++;
  }

  return plans.map((p) => ({
    ...p,
    assigned_rep_label: p.assigned_rep_id ? staffLabelFromLookup(p.assigned_rep_id, staffById) : null,
    created_by_label: p.created_by ? staffLabelFromLookup(p.created_by, staffById) : null,
    stop_count: counts[p.id]?.total ?? 0,
    pending_count: counts[p.id]?.pending ?? 0,
    completed_count: counts[p.id]?.completed ?? 0,
    skipped_count: counts[p.id]?.skipped ?? 0,
    checked_in_count: counts[p.id]?.checked_in ?? 0,
  }));
}

export type ListRoutePlansFilters = {
  assigned_rep_id?: string;
  status?: string;
  start_date?: string;
  end_date?: string;
  limit?: number;
  offset?: number;
};

export async function listRoutePlans(
  staff: StaffProfile,
  filters: ListRoutePlansFilters = {}
): Promise<{ routes: RoutePlanCard[]; total: number }> {
  if (!canAccessFacilityFieldTools(staff)) return { routes: [], total: 0 };

  const limit = Math.min(Math.max(filters.limit ?? 100, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);

  let query = supabaseAdmin.from("facility_route_plans").select("*", { count: "exact" });

  if (!canAccessFacilityAdminTools(staff)) {
    query = query.or(`assigned_rep_id.eq.${staff.user_id},created_by.eq.${staff.user_id}`);
  } else if (filters.assigned_rep_id && UUID_RE.test(filters.assigned_rep_id)) {
    query = query.eq("assigned_rep_id", filters.assigned_rep_id);
  }

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.start_date) query = query.gte("route_date", filters.start_date);
  if (filters.end_date) query = query.lte("route_date", filters.end_date);

  query = query.order("route_date", { ascending: false }).order("created_at", { ascending: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  const rows = (data ?? []).map((r) => mapPlanRow(r as Record<string, unknown>));
  const cards = await enrichPlanCards(rows);
  return { routes: cards, total: count ?? cards.length };
}

export async function getRoutePlanDetail(staff: StaffProfile, routeId: string): Promise<RoutePlanDetail | null> {
  const plan = await loadPlanForStaff(staff, routeId);
  if (!plan) return null;

  const { data: stopRows } = await supabaseAdmin
    .from("facility_route_stops")
    .select("*")
    .eq("route_plan_id", routeId)
    .order("stop_order", { ascending: true });

  const stops: RouteStopCard[] = (stopRows ?? []).map((s) => ({
    ...mapStopRow(s as Record<string, unknown>),
    distance_miles: null,
  }));

  const [card] = await enrichPlanCards([plan]);
  return { ...card, stops };
}

export async function createRoutePlan(
  staff: StaffProfile,
  input: CreateRoutePlanInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!canAccessFacilityFieldTools(staff)) return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "missing_name" };
  if (!input.stops.length) return { ok: false, error: "empty_route" };

  let assignedRepId = input.assigned_rep_id ?? staff.user_id;
  if (!canAccessFacilityAdminTools(staff)) assignedRepId = staff.user_id;

  const routeDate = (input.route_date ?? getCrmCalendarTodayIso()).slice(0, 10);
  const status: RoutePlanStatus = input.status ?? "planned";

  const { data: plan, error } = await supabaseAdmin
    .from("facility_route_plans")
    .insert({
      name,
      route_date: routeDate,
      assigned_rep_id: assignedRepId,
      created_by: staff.user_id,
      status,
      notes: (input.notes ?? "").trim() || null,
      start_latitude: input.start_latitude ?? null,
      start_longitude: input.start_longitude ?? null,
      start_address: (input.start_address ?? "").trim() || null,
      metadata: input.metadata ?? null,
    })
    .select("id, assigned_rep_id, name")
    .single();

  if (error || !plan?.id) return { ok: false, error: "save_failed" };

  const stopRows = input.stops.map((s, idx) => ({
    route_plan_id: plan.id,
    stop_order: idx + 1,
    facility_id: s.facility_id ?? null,
    google_place_id: s.google_place_id ?? null,
    name: s.name.trim(),
    address: (s.address ?? "").trim() || null,
    phone: (s.phone ?? "").trim() || null,
    latitude: typeof s.latitude === "number" ? s.latitude : null,
    longitude: typeof s.longitude === "number" ? s.longitude : null,
    source: s.source ?? null,
    portal_status: s.portal_status ?? null,
    notes: (s.notes ?? "").trim() || null,
    status: "pending",
  }));

  const { error: stopErr } = await supabaseAdmin.from("facility_route_stops").insert(stopRows);
  if (stopErr) {
    await supabaseAdmin.from("facility_route_plans").delete().eq("id", plan.id);
    return { ok: false, error: "stops_failed" };
  }

  const assignedId = String((plan as { assigned_rep_id?: string }).assigned_rep_id ?? "");
  if (assignedId && assignedId !== staff.user_id) {
    queueFacilityNotification(() =>
      createFacilityNotification({
        userId: assignedId,
        notificationType: "facility_route_assigned",
        title: "Route assigned",
        message: `Route "${name}" assigned for ${routeDate}.`,
        severity: "info",
        actionUrl: `/admin/facilities/routes/${plan.id}`,
        metadata: { route_plan_id: plan.id },
        dedupeKey: `facility_route_assigned:${plan.id}`,
      })
    );
  }

  return { ok: true, id: String(plan.id) };
}

export async function updateRoutePlan(
  staff: StaffProfile,
  routeId: string,
  patch: Partial<{ name: string; notes: string | null; assigned_rep_id: string | null; route_date: string; status: RoutePlanStatus }>
): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await loadPlanForStaff(staff, routeId);
  if (!plan) return { ok: false, error: "not_found" };
  if (!canMutateRoutePlan(staff, plan)) return { ok: false, error: "forbidden" };
  if (plan.status === "completed" || plan.status === "canceled") return { ok: false, error: "invalid_status" };

  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.notes !== undefined) update.notes = (patch.notes ?? "").trim() || null;
  if (patch.route_date !== undefined) update.route_date = patch.route_date.slice(0, 10);
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.assigned_rep_id !== undefined) {
    if (!canAccessFacilityAdminTools(staff) && patch.assigned_rep_id !== staff.user_id) {
      return { ok: false, error: "forbidden" };
    }
    update.assigned_rep_id = patch.assigned_rep_id;
  }

  const { error } = await supabaseAdmin.from("facility_route_plans").update(update).eq("id", routeId);
  return error ? { ok: false, error: "update_failed" } : { ok: true };
}

export async function startRoutePlan(
  staff: StaffProfile,
  routeId: string,
  input?: { latitude?: number | null; longitude?: number | null; address?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await loadPlanForStaff(staff, routeId);
  if (!plan) return { ok: false, error: "not_found" };
  if (!canMutateRoutePlan(staff, plan)) return { ok: false, error: "forbidden" };
  if (plan.status === "completed" || plan.status === "canceled") return { ok: false, error: "invalid_status" };

  const startedAt = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("facility_route_plans")
    .update({
      status: "in_progress",
      started_at: plan.started_at ?? startedAt,
      start_latitude: input?.latitude ?? plan.start_latitude,
      start_longitude: input?.longitude ?? plan.start_longitude,
      start_address: input?.address ?? plan.start_address,
    })
    .eq("id", routeId);

  if (error) return { ok: false, error: "start_failed" };

  if (canAccessFacilityAdminTools(staff) && plan.assigned_rep_id && plan.assigned_rep_id !== staff.user_id) {
    queueFacilityNotification(() =>
      createFacilityNotification({
        userId: plan.assigned_rep_id!,
        notificationType: "facility_route_started",
        title: "Route started",
        message: `Route "${plan.name}" was started.`,
        severity: "info",
        actionUrl: `/admin/facilities/routes/${routeId}`,
        metadata: { route_plan_id: routeId },
        dedupeKey: `facility_route_started:${routeId}`,
      })
    );
  }

  return { ok: true };
}

export async function completeRoutePlan(
  staff: StaffProfile,
  routeId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await loadPlanForStaff(staff, routeId);
  if (!plan) return { ok: false, error: "not_found" };
  if (!canMutateRoutePlan(staff, plan)) return { ok: false, error: "forbidden" };
  if (plan.status === "completed" || plan.status === "canceled") return { ok: false, error: "invalid_status" };

  const { error } = await supabaseAdmin
    .from("facility_route_plans")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: staff.user_id,
    })
    .eq("id", routeId);

  if (error) return { ok: false, error: "complete_failed" };

  const notifyIds = new Set<string>();
  if (plan.assigned_rep_id) notifyIds.add(plan.assigned_rep_id);
  if (plan.created_by) notifyIds.add(plan.created_by);
  for (const uid of notifyIds) {
    queueFacilityNotification(() =>
      createFacilityNotification({
        userId: uid,
        notificationType: "facility_route_completed",
        title: "Route completed",
        message: `Route "${plan.name}" marked complete.`,
        severity: "success",
        actionUrl: `/admin/facilities/routes/${routeId}`,
        metadata: { route_plan_id: routeId },
        dedupeKey: `facility_route_completed:${routeId}`,
      })
    );
  }

  return { ok: true };
}

export async function cancelRoutePlan(
  staff: StaffProfile,
  routeId: string,
  reason?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const plan = await loadPlanForStaff(staff, routeId);
  if (!plan) return { ok: false, error: "not_found" };
  if (!canAccessFacilityAdminTools(staff) && !canMutateRoutePlan(staff, plan)) {
    return { ok: false, error: "forbidden" };
  }
  if (plan.status === "completed") return { ok: false, error: "invalid_status" };

  const notes = [plan.notes, reason ? `Canceled: ${reason}` : null].filter(Boolean).join("\n");
  const { error } = await supabaseAdmin
    .from("facility_route_plans")
    .update({ status: "canceled", notes: notes || plan.notes })
    .eq("id", routeId);

  return error ? { ok: false, error: "cancel_failed" } : { ok: true };
}

async function loadStopForStaff(
  staff: StaffProfile,
  routeId: string,
  stopId: string
): Promise<{ plan: RoutePlanRow; stop: RouteStopRow } | null> {
  const plan = await loadPlanForStaff(staff, routeId);
  if (!plan) return null;
  if (!UUID_RE.test(stopId)) return null;
  const { data } = await supabaseAdmin
    .from("facility_route_stops")
    .select("*")
    .eq("id", stopId)
    .eq("route_plan_id", routeId)
    .maybeSingle();
  if (!data) return null;
  return { plan, stop: mapStopRow(data as Record<string, unknown>) };
}

export async function checkInRouteStop(
  staff: StaffProfile,
  routeId: string,
  stopId: string,
  input: { latitude?: number | null; longitude?: number | null }
): Promise<{ ok: true; warning?: string } | { ok: false; error: string }> {
  const loaded = await loadStopForStaff(staff, routeId, stopId);
  if (!loaded) return { ok: false, error: "not_found" };
  if (!canMutateRoutePlan(staff, loaded.plan)) return { ok: false, error: "forbidden" };
  if (loaded.plan.status === "completed" || loaded.plan.status === "canceled") {
    return { ok: false, error: "invalid_status" };
  }
  if (loaded.stop.status === "completed" || loaded.stop.status === "skipped") {
    return { ok: false, error: "stop_closed" };
  }

  let warning: string | undefined;
  if (
    input.latitude != null &&
    input.longitude != null &&
    loaded.stop.latitude != null &&
    loaded.stop.longitude != null
  ) {
    const { haversineDistanceMiles } = await import("@/lib/crm/facility-geolocation");
    const miles = haversineDistanceMiles(
      { latitude: input.latitude, longitude: input.longitude },
      { latitude: loaded.stop.latitude, longitude: loaded.stop.longitude }
    );
    if (miles > 0.25) warning = "away_from_facility";
  }

  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("facility_route_stops")
    .update({
      status: "checked_in",
      checked_in_at: now,
      checked_in_latitude: input.latitude ?? null,
      checked_in_longitude: input.longitude ?? null,
    })
    .eq("id", stopId);

  if (error) return { ok: false, error: "check_in_failed" };

  if (loaded.plan.status === "planned" || loaded.plan.status === "draft") {
    await startRoutePlan(staff, routeId, {
      latitude: input.latitude,
      longitude: input.longitude,
    });
  }

  return { ok: true, warning };
}

export async function completeRouteStop(
  staff: StaffProfile,
  routeId: string,
  stopId: string,
  input?: { linked_activity_id?: string | null; linked_photo_id?: string | null; notes?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadStopForStaff(staff, routeId, stopId);
  if (!loaded) return { ok: false, error: "not_found" };
  if (!canMutateRoutePlan(staff, loaded.plan)) return { ok: false, error: "forbidden" };
  if (loaded.stop.status === "completed" || loaded.stop.status === "skipped") {
    return { ok: false, error: "stop_closed" };
  }

  const activityId = input?.linked_activity_id ?? loaded.stop.linked_activity_id;
  const now = new Date().toISOString();

  const { error } = await supabaseAdmin
    .from("facility_route_stops")
    .update({
      status: "completed",
      completed_at: now,
      checked_out_at: loaded.stop.checked_out_at ?? now,
      linked_activity_id: activityId,
      linked_photo_id: input?.linked_photo_id ?? loaded.stop.linked_photo_id,
      notes: (input?.notes ?? loaded.stop.notes ?? "").trim() || null,
    })
    .eq("id", stopId);

  return error ? { ok: false, error: "complete_failed" } : { ok: true };
}

export async function skipRouteStop(
  staff: StaffProfile,
  routeId: string,
  stopId: string,
  input: { skip_reason: string; notes?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadStopForStaff(staff, routeId, stopId);
  if (!loaded) return { ok: false, error: "not_found" };
  if (!canMutateRoutePlan(staff, loaded.plan)) return { ok: false, error: "forbidden" };
  if (loaded.stop.status === "completed" || loaded.stop.status === "skipped") {
    return { ok: false, error: "stop_closed" };
  }

  const { error } = await supabaseAdmin
    .from("facility_route_stops")
    .update({
      status: "skipped",
      skipped_at: new Date().toISOString(),
      skip_reason: input.skip_reason.trim(),
      notes: (input.notes ?? "").trim() || loaded.stop.notes,
    })
    .eq("id", stopId);

  return error ? { ok: false, error: "skip_failed" } : { ok: true };
}

export async function linkRouteStopActivity(
  staff: StaffProfile,
  routeId: string,
  stopId: string,
  activityId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadStopForStaff(staff, routeId, stopId);
  if (!loaded) return { ok: false, error: "not_found" };
  if (!canMutateRoutePlan(staff, loaded.plan)) return { ok: false, error: "forbidden" };

  const { error } = await supabaseAdmin
    .from("facility_route_stops")
    .update({ linked_activity_id: activityId })
    .eq("id", stopId);

  return error ? { ok: false, error: "link_failed" } : { ok: true };
}

export async function linkRouteStopToFacility(
  staff: StaffProfile,
  routeId: string,
  stopId: string,
  facilityId: string,
  facilityName?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadStopForStaff(staff, routeId, stopId);
  if (!loaded) return { ok: false, error: "not_found" };
  if (!canMutateRoutePlan(staff, loaded.plan)) return { ok: false, error: "forbidden" };

  const { error } = await supabaseAdmin
    .from("facility_route_stops")
    .update({
      facility_id: facilityId,
      portal_status: "already_in_portal",
      source: "portal",
      name: facilityName?.trim() || loaded.stop.name,
    })
    .eq("id", stopId);

  return error ? { ok: false, error: "link_failed" } : { ok: true };
}

export async function loadRouteRepPerformance(
  staff: StaffProfile,
  startDate: string,
  endDate: string
): Promise<Record<string, { routesCompleted: number; routeStopsCompleted: number; routeStopsTotal: number }>> {
  if (!canAccessFacilityFieldTools(staff)) return {};

  let planQuery = supabaseAdmin
    .from("facility_route_plans")
    .select("id, assigned_rep_id, status")
    .gte("route_date", startDate)
    .lte("route_date", endDate);

  if (!canAccessFacilityAdminTools(staff)) planQuery = planQuery.eq("assigned_rep_id", staff.user_id);

  const { data: plans } = await planQuery;
  const byRep: Record<string, { routesCompleted: number; routeStopsCompleted: number; routeStopsTotal: number }> = {};
  const planIds = (plans ?? []).map((p) => String((p as { id: string }).id));

  for (const p of plans ?? []) {
    const rep = String((p as { assigned_rep_id?: string }).assigned_rep_id ?? "unassigned");
    if (!byRep[rep]) byRep[rep] = { routesCompleted: 0, routeStopsCompleted: 0, routeStopsTotal: 0 };
    if ((p as { status: string }).status === "completed") byRep[rep].routesCompleted++;
  }

  if (planIds.length) {
    const { data: stops } = await supabaseAdmin
      .from("facility_route_stops")
      .select("route_plan_id, status")
      .in("route_plan_id", planIds);
    const planRep: Record<string, string> = {};
    for (const p of plans ?? []) {
      planRep[String((p as { id: string }).id)] = String((p as { assigned_rep_id?: string }).assigned_rep_id ?? "unassigned");
    }
    for (const s of stops ?? []) {
      const rep = planRep[String((s as { route_plan_id: string }).route_plan_id)] ?? "unassigned";
      if (!byRep[rep]) byRep[rep] = { routesCompleted: 0, routeStopsCompleted: 0, routeStopsTotal: 0 };
      byRep[rep].routeStopsTotal++;
      if ((s as { status: string }).status === "completed") byRep[rep].routeStopsCompleted++;
    }
  }

  return byRep;
}

export async function getActiveRouteForToday(staff: StaffProfile): Promise<RoutePlanDetail | null> {
  if (!canAccessFacilityFieldTools(staff)) return null;
  const today = getCrmCalendarTodayIso();

  let query = supabaseAdmin
    .from("facility_route_plans")
    .select("*")
    .eq("route_date", today)
    .in("status", ["planned", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(1);

  if (!canAccessFacilityAdminTools(staff)) {
    query = query.eq("assigned_rep_id", staff.user_id);
  }

  const { data } = await query.maybeSingle();
  if (!data) return null;
  return getRoutePlanDetail(staff, String((data as { id: string }).id));
}

export async function loadRoutePerformanceMetrics(
  staff: StaffProfile,
  startDate: string,
  endDate: string,
  repId?: string | null
): Promise<RoutePerformanceSummary> {
  const empty: RoutePerformanceSummary = {
    routesPlanned: 0,
    routesStarted: 0,
    routesCompleted: 0,
    stopsPlanned: 0,
    stopsCompleted: 0,
    stopsSkipped: 0,
    completionRate: null,
    avgStopsPerRoute: null,
    visitsLoggedFromRoute: 0,
    photoProofFromRoute: 0,
    referralsFromRoute: 0,
  };
  if (!canAccessFacilityFieldTools(staff)) return empty;

  let planQuery = supabaseAdmin
    .from("facility_route_plans")
    .select("id, status, assigned_rep_id, started_at")
    .gte("route_date", startDate)
    .lte("route_date", endDate);

  if (repId) planQuery = planQuery.eq("assigned_rep_id", repId);
  else if (!canAccessFacilityAdminTools(staff)) planQuery = planQuery.eq("assigned_rep_id", staff.user_id);

  const { data: plans } = await planQuery;
  const planIds = (plans ?? []).map((p) => String((p as { id: string }).id));
  if (!planIds.length) return empty;

  const routesPlanned = (plans ?? []).filter((p) => (p as { status: string }).status !== "canceled").length;
  const routesStarted = (plans ?? []).filter((p) => Boolean((p as { started_at?: string }).started_at)).length;
  const routesCompleted = (plans ?? []).filter((p) => (p as { status: string }).status === "completed").length;

  const { data: stops } = await supabaseAdmin
    .from("facility_route_stops")
    .select("id, status, linked_activity_id, linked_photo_id")
    .in("route_plan_id", planIds);

  const allStops = stops ?? [];
  const stopsCompleted = allStops.filter((s) => (s as { status: string }).status === "completed").length;
  const stopsSkipped = allStops.filter((s) => (s as { status: string }).status === "skipped").length;
  const stopsPlanned = allStops.length;
  const activityIds = allStops
    .map((s) => (s as { linked_activity_id?: string }).linked_activity_id)
    .filter(Boolean) as string[];

  let visitsLoggedFromRoute = activityIds.length;
  let photoProofFromRoute = allStops.filter((s) => (s as { linked_photo_id?: string }).linked_photo_id).length;
  let referralsFromRoute = 0;

  if (activityIds.length) {
    const { data: acts } = await supabaseAdmin
      .from("facility_activities")
      .select("id, outcome")
      .in("id", activityIds);
    referralsFromRoute = (acts ?? []).filter((a) => {
      const o = String((a as { outcome?: string }).outcome ?? "");
      return o.includes("Referral") || o === "Received Referral";
    }).length;
  }

  const actionableStops = stopsCompleted + stopsSkipped;
  return {
    routesPlanned,
    routesStarted,
    routesCompleted,
    stopsPlanned,
    stopsCompleted,
    stopsSkipped,
    completionRate: actionableStops > 0 ? Math.round((stopsCompleted / actionableStops) * 100) : null,
    avgStopsPerRoute: routesPlanned > 0 ? Math.round((stopsPlanned / routesPlanned) * 10) / 10 : null,
    visitsLoggedFromRoute,
    photoProofFromRoute,
    referralsFromRoute,
  };
}

export async function syncRoutePlanAlerts(staff: StaffProfile): Promise<void> {
  if (!canAccessFacilityFieldTools(staff)) return;
  const today = getCrmCalendarTodayIso();
  const hour = new Date().getHours();

  let query = supabaseAdmin
    .from("facility_route_plans")
    .select("id, name, assigned_rep_id, status, route_date")
    .eq("route_date", today)
    .in("status", ["planned", "in_progress"]);

  if (!canAccessFacilityAdminTools(staff)) query = query.eq("assigned_rep_id", staff.user_id);

  const { data: routes } = await query;
  for (const raw of routes ?? []) {
    const r = raw as { id: string; name: string; assigned_rep_id: string | null; status: string };
    if (!r.assigned_rep_id) continue;

    if (r.status === "planned" && hour >= 12) {
      queueFacilityNotification(() =>
        createFacilityNotification({
          userId: r.assigned_rep_id!,
          notificationType: "facility_route_unfinished",
          title: "Route not started",
          message: `Today's route "${r.name}" has not been started yet.`,
          severity: "warning",
          actionUrl: `/admin/facilities/routes/${r.id}`,
          metadata: { route_plan_id: r.id },
          dedupeKey: `facility_route_not_started:${r.id}:${today}`,
        })
      );
    }

    if (r.status === "in_progress" && hour >= 16) {
      const { count } = await supabaseAdmin
        .from("facility_route_stops")
        .select("id", { count: "exact", head: true })
        .eq("route_plan_id", r.id)
        .in("status", ["pending", "checked_in"]);

      if ((count ?? 0) > 0) {
        queueFacilityNotification(() =>
          createFacilityNotification({
            userId: r.assigned_rep_id!,
            notificationType: "facility_route_unfinished",
            title: "Route still unfinished",
            message: `${count} stops remain on "${r.name}".`,
            severity: "warning",
            actionUrl: `/admin/facilities/routes/${r.id}`,
            metadata: { route_plan_id: r.id },
            dedupeKey: `facility_route_unfinished:${r.id}:${today}`,
          })
        );
      }
    }
  }
}
