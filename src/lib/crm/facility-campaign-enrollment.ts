import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import {
  addCalendarDaysToIsoDate,
  getCrmCalendarDateIsoFromInstant,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import type {
  CampaignCandidateFacility,
  CampaignCandidateFilters,
  CampaignCandidateSummary,
  FacilitySegmentRow,
} from "@/lib/crm/facility-playbook-types";
import { effectiveTaskDueAt, effectiveTaskStatus } from "@/lib/crm/facility-follow-up-tasks";
import type { FollowUpTaskRow } from "@/lib/crm/facility-follow-up-task-types";
import { staffLabelFromLookup } from "@/lib/crm/crm-leads-table-helpers";
import type { StaffProfile } from "@/lib/staff-profile";
import { canAccessFacilityAdminTools } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const WARM_OUTCOMES = new Set([
  "Wants Packet Faxed",
  "Wants Email Info",
  "Asked to Follow Up",
  "Met Decision Maker",
  "Good Conversation",
  "Referral Sent",
]);

function mapSegment(raw: Record<string, unknown>): FacilitySegmentRow {
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: typeof raw.description === "string" ? raw.description : null,
    filters_json:
      raw.filters_json && typeof raw.filters_json === "object" && !Array.isArray(raw.filters_json)
        ? (raw.filters_json as Record<string, unknown>)
        : {},
    created_by: typeof raw.created_by === "string" ? raw.created_by : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

export async function listFacilitySegments(staff: StaffProfile): Promise<FacilitySegmentRow[]> {
  if (!canAccessFacilityAdminTools(staff)) return [];
  const { data } = await supabaseAdmin
    .from("facility_segments")
    .select("*")
    .order("name");
  return (data ?? []).map((r) => mapSegment(r as Record<string, unknown>));
}

export async function saveFacilitySegment(
  staff: StaffProfile,
  input: { name: string; description?: string | null; filters_json: Record<string, unknown> }
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "missing_name" };

  const { data, error } = await supabaseAdmin
    .from("facility_segments")
    .insert({
      name,
      description: (input.description ?? "").trim() || null,
      filters_json: input.filters_json,
      created_by: staff.user_id,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) return { ok: false, error: "save_failed" };
  return { ok: true, id: String(data.id) };
}

export async function listCampaignCandidateFacilities(
  staff: StaffProfile,
  campaignId: string,
  filters: CampaignCandidateFilters
): Promise<{ facilities: CampaignCandidateFacility[]; total: number; summary: CampaignCandidateSummary }> {
  const emptySummary: CampaignCandidateSummary = {
    not_enrolled: 0,
    already_enrolled: 0,
    selected_possible: 0,
  };

  if (!canAccessFacilityAdminTools(staff)) {
    return { facilities: [], total: 0, summary: emptySummary };
  }
  if (!UUID_RE.test(campaignId)) {
    return { facilities: [], total: 0, summary: emptySummary };
  }

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const today = getCrmCalendarTodayIso();

  let query = supabaseAdmin
    .from("facilities")
    .select(
      "id, name, type, city, state, zip, address_line_1, address_line_2, main_phone, priority, status, source, specialty_tags, last_visit_at, next_follow_up_at, relationship_strength, visit_frequency, assigned_rep_user_id, google_place_id"
    )
    .eq("is_active", true)
    .order("name")
    .limit(500);

  if (filters.city?.trim()) query = query.ilike("city", `%${filters.city.trim()}%`);
  if (filters.facility_type?.trim()) query = query.ilike("type", `%${filters.facility_type.trim()}%`);
  if (filters.priority?.trim()) query = query.eq("priority", filters.priority.trim());
  if (filters.assigned_rep_id && UUID_RE.test(filters.assigned_rep_id)) {
    query = query.eq("assigned_rep_user_id", filters.assigned_rep_id);
  }
  if (filters.source === "google_places") query = query.eq("source", "google_places");
  if (filters.source === "manual") query = query.or("source.is.null,source.eq.manual");
  if (filters.not_visited === "1" || filters.not_visited === true) query = query.is("last_visit_at", null);

  const search = (filters.search ?? "").trim();
  if (search) {
    const term = `%${search}%`;
    query = query.or(
      `name.ilike.${term},city.ilike.${term},address_line_1.ilike.${term},main_phone.ilike.${term}`
    );
  }

  if (filters.relationship_status?.trim()) {
    query = query.eq("status", filters.relationship_status.trim());
  }

  const { data: facilityRows } = await query;
  let facilities = (facilityRows ?? []) as Record<string, unknown>[];

  if (filters.last_visit === "14_plus") {
    const cutoff = `${addCalendarDaysToIsoDate(today, -14)}T23:59:59.999Z`;
    facilities = facilities.filter(
      (f) => !f.last_visit_at || String(f.last_visit_at) < cutoff
    );
  } else if (filters.last_visit === "30_plus") {
    const cutoff = `${addCalendarDaysToIsoDate(today, -30)}T23:59:59.999Z`;
    facilities = facilities.filter(
      (f) => !f.last_visit_at || String(f.last_visit_at) < cutoff
    );
  } else if (filters.last_visit === "never") {
    facilities = facilities.filter((f) => !f.last_visit_at);
  }

  if (filters.specialty?.trim()) {
    const needle = filters.specialty.trim().toLowerCase();
    facilities = facilities.filter((f) => {
      const type = String(f.type ?? "").toLowerCase();
      const tags = Array.isArray(f.specialty_tags) ? (f.specialty_tags as string[]) : [];
      return type.includes(needle) || tags.some((t) => t.toLowerCase().includes(needle));
    });
  }

  const facilityIds = facilities.map((f) => String(f.id));
  if (facilityIds.length === 0) {
    return { facilities: [], total: 0, summary: emptySummary };
  }

  let contactMatchIds: Set<string> | null = null;
  if (search) {
    const { data: contacts } = await supabaseAdmin
      .from("facility_contacts")
      .select("facility_id, full_name, first_name, last_name")
      .ilike("full_name", `%${search}%`)
      .limit(100);
    contactMatchIds = new Set((contacts ?? []).map((c) => String((c as { facility_id: string }).facility_id)));
    if (contactMatchIds.size > 0) {
      const searchLower = search.toLowerCase();
      facilities = facilities.filter((f) => {
        const id = String(f.id);
        if (contactMatchIds!.has(id)) return true;
        const name = String(f.name ?? "").toLowerCase();
        return (
          name.includes(searchLower) ||
          String(f.city ?? "").toLowerCase().includes(searchLower) ||
          String(f.main_phone ?? "").includes(search)
        );
      });
    }
  }

  const [{ data: thisEnrollments }, { data: otherEnrollments }] = await Promise.all([
    supabaseAdmin
      .from("facility_campaign_enrollments")
      .select("facility_id, status")
      .eq("campaign_id", campaignId)
      .in("facility_id", facilityIds),
    supabaseAdmin
      .from("facility_campaign_enrollments")
      .select("facility_id, campaign_id, status")
      .neq("campaign_id", campaignId)
      .eq("status", "active")
      .in("facility_id", facilityIds),
  ]);

  const enrolledThis = new Set<string>();
  for (const e of thisEnrollments ?? []) {
    const st = (e as { status: string }).status;
    if (st === "active" || st === "completed" || st === "paused") {
      enrolledThis.add(String((e as { facility_id: string }).facility_id));
    }
  }

  const enrolledOther: Record<string, string> = {};
  const otherCampaignIds = [
    ...new Set(
      (otherEnrollments ?? []).map((e) => String((e as { campaign_id: string }).campaign_id))
    ),
  ];
  const otherCampaignNames: Record<string, string> = {};
  if (otherCampaignIds.length) {
    const { data: camps } = await supabaseAdmin
      .from("facility_campaigns")
      .select("id, name")
      .in("id", otherCampaignIds);
    for (const c of camps ?? []) {
      otherCampaignNames[(c as { id: string }).id] = String((c as { name?: string }).name ?? "Campaign");
    }
  }
  for (const e of otherEnrollments ?? []) {
    const fid = String((e as { facility_id: string }).facility_id);
    const cid = String((e as { campaign_id: string }).campaign_id);
    enrolledOther[fid] = otherCampaignNames[cid] ?? "Campaign";
  }

  const { data: referralRows } = await supabaseAdmin
    .from("leads")
    .select("referring_facility_id")
    .in("referring_facility_id", facilityIds)
    .is("deleted_at", null);
  const referralCount: Record<string, number> = {};
  for (const r of referralRows ?? []) {
    const fid = String((r as { referring_facility_id: string }).referring_facility_id);
    referralCount[fid] = (referralCount[fid] ?? 0) + 1;
  }

  const warmStart = new Date();
  warmStart.setDate(warmStart.getDate() - 90);
  const { data: actRows } = await supabaseAdmin
    .from("facility_activities")
    .select("facility_id, outcome, referral_potential, activity_type, activity_at, decision_maker_met")
    .in("facility_id", facilityIds)
    .gte("activity_at", warmStart.toISOString())
    .order("activity_at", { ascending: false });

  const latestAct: Record<string, Record<string, unknown>> = {};
  for (const a of actRows ?? []) {
    const fid = String((a as { facility_id: string }).facility_id);
    if (!latestAct[fid]) latestAct[fid] = a as Record<string, unknown>;
  }

  const { data: taskRows } = await supabaseAdmin
    .from("facility_follow_up_tasks")
    .select("facility_id, due_at, status, snoozed_until")
    .in("facility_id", facilityIds)
    .in("status", ["open", "snoozed"]);

  const followUpByFacility: Record<string, "due" | "overdue" | "upcoming"> = {};
  for (const raw of taskRows ?? []) {
    const t = raw as FollowUpTaskRow;
    if (effectiveTaskStatus(t) !== "open") continue;
    const fid = t.facility_id;
    const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(effectiveTaskDueAt(t)));
    let st: "due" | "overdue" | "upcoming" = "upcoming";
    if (dueYmd < today) st = "overdue";
    else if (dueYmd === today) st = "due";
    const prev = followUpByFacility[fid];
    if (!prev || st === "overdue" || (st === "due" && prev === "upcoming")) {
      followUpByFacility[fid] = st;
    }
  }

  const { data: staffRows } = await supabaseAdmin.from("staff_profiles").select("user_id, full_name, email");
  const staffById: Record<string, { full_name: string | null; email: string | null }> = {};
  for (const s of staffRows ?? []) {
    staffById[(s as { user_id: string }).user_id] = s as { full_name: string | null; email: string | null };
  }

  function isWarmAct(a: Record<string, unknown> | undefined): boolean {
    if (!a) return false;
    if (a.activity_type === "Referral Received") return true;
    if (a.outcome && WARM_OUTCOMES.has(String(a.outcome))) return true;
    if (a.referral_potential === "Warm" || a.referral_potential === "Hot") return true;
    if (a.decision_maker_met) return true;
    return false;
  }

  let candidates: CampaignCandidateFacility[] = facilities.map((f) => {
    const id = String(f.id);
    const act = latestAct[id];
    const enrolledHere = enrolledThis.has(id);
    const otherName = enrolledOther[id] ?? null;

    let enrollment_status: CampaignCandidateFacility["enrollment_status"] = "not_enrolled";
    if (enrolledHere) enrollment_status = "enrolled_this";
    else if (otherName) enrollment_status = "enrolled_other";

    const repId = typeof f.assigned_rep_user_id === "string" ? f.assigned_rep_user_id : null;

    return {
      id,
      name: String(f.name ?? "Facility"),
      type: typeof f.type === "string" ? f.type : null,
      city: typeof f.city === "string" ? f.city : null,
      address: buildFacilityFullAddress(f as Parameters<typeof buildFacilityFullAddress>[0]),
      main_phone: typeof f.main_phone === "string" ? f.main_phone : null,
      priority: String(f.priority ?? "Medium"),
      status: String(f.status ?? "New"),
      source: typeof f.source === "string" ? f.source : f.google_place_id ? "google_places" : "manual",
      specialty_tags: Array.isArray(f.specialty_tags) ? (f.specialty_tags as string[]) : null,
      last_visit_at: typeof f.last_visit_at === "string" ? f.last_visit_at : null,
      next_follow_up_at: typeof f.next_follow_up_at === "string" ? f.next_follow_up_at : null,
      relationship_strength:
        typeof f.relationship_strength === "number" ? f.relationship_strength : null,
      visit_frequency: typeof f.visit_frequency === "string" ? f.visit_frequency : null,
      assigned_rep_user_id: repId,
      assigned_rep_label: repId ? staffLabelFromLookup(repId, staffById) : null,
      referral_count: referralCount[id] ?? 0,
      referral_potential: act ? (act.referral_potential as string | null) : null,
      is_warm: isWarmAct(act),
      follow_up_status: followUpByFacility[id] ?? null,
      enrollment_status,
      other_campaign_name: otherName,
    };
  });

  const enrollmentFilter = filters.enrollment_status ?? "not_enrolled";
  if (enrollmentFilter === "not_enrolled") {
    candidates = candidates.filter((c) => c.enrollment_status === "not_enrolled");
  } else if (enrollmentFilter === "already_enrolled") {
    candidates = candidates.filter((c) => c.enrollment_status === "enrolled_this");
  }

  if (filters.has_referrals === "yes") candidates = candidates.filter((c) => c.referral_count > 0);
  if (filters.has_referrals === "no") candidates = candidates.filter((c) => c.referral_count === 0);

  if (filters.referral_potential === "warm_hot") {
    candidates = candidates.filter(
      (c) => c.is_warm || c.referral_potential === "Warm" || c.referral_potential === "Hot"
    );
  }

  if (filters.follow_up_status === "overdue") {
    candidates = candidates.filter((c) => c.follow_up_status === "overdue");
  } else if (filters.follow_up_status === "due") {
    candidates = candidates.filter((c) => c.follow_up_status === "due" || c.follow_up_status === "overdue");
  }

  if (filters.no_active_campaign === "1" || filters.no_active_campaign === true) {
    candidates = candidates.filter((c) => c.enrollment_status === "not_enrolled");
  }

  const summary: CampaignCandidateSummary = {
    not_enrolled: candidates.filter((c) => c.enrollment_status === "not_enrolled").length,
    already_enrolled: candidates.filter((c) => c.enrollment_status === "enrolled_this").length,
    selected_possible: candidates.filter((c) => c.enrollment_status === "not_enrolled").length,
  };

  const total = candidates.length;
  const page = candidates.slice(offset, offset + limit);

  return { facilities: page, total, summary };
}

export function parseCandidateFiltersFromSearchParams(
  params: URLSearchParams
): CampaignCandidateFilters {
  return {
    search: params.get("search") ?? undefined,
    city: params.get("city") ?? undefined,
    facility_type: params.get("facility_type") ?? undefined,
    specialty: params.get("specialty") ?? undefined,
    priority: params.get("priority") ?? undefined,
    assigned_rep_id: params.get("assigned_rep_id") ?? undefined,
    relationship_status: params.get("relationship_status") ?? undefined,
    source: params.get("source") ?? undefined,
    last_visit: params.get("last_visit") ?? undefined,
    not_visited: params.get("not_visited") === "1" ? true : undefined,
    follow_up_status: params.get("follow_up_status") ?? undefined,
    referral_potential: params.get("referral_potential") ?? undefined,
    has_referrals: params.get("has_referrals") ?? undefined,
    enrollment_status: params.get("enrollment_status") ?? "not_enrolled",
    no_active_campaign: params.get("no_active_campaign") === "1" ? true : undefined,
    limit: params.get("limit") ? Number(params.get("limit")) : 50,
    offset: params.get("offset") ? Number(params.get("offset")) : 0,
  };
}
