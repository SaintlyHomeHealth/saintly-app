import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/admin";
import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import {
  addCalendarDaysToIsoDate,
  getCrmCalendarDateIsoFromInstant,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import { getPlaybook } from "@/lib/crm/facility-playbooks";
import type {
  CampaignAnalyticsRow,
  CampaignAnalyticsSummary,
  CampaignCard,
  CampaignDetail,
  CampaignEnrollmentCard,
  CampaignQuickLogContext,
  CampaignRow,
  CampaignStatus,
  CampaignStepCard,
  FacilityEnrollmentSummary,
  StepInstanceStatus,
} from "@/lib/crm/facility-playbook-types";
import type { PlaybookStepRow } from "@/lib/crm/facility-playbook-types";
import {
  createFacilityNotification,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import { staffLabelFromLookup } from "@/lib/crm/crm-leads-table-helpers";
import type { StaffProfile } from "@/lib/staff-profile";
import {
  canAccessFacilityAdminTools,
  isManagerOrHigher,
  isSalesAgentRole,
} from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function dueAtFromStart(startDateYmd: string, offsetDays: number): string {
  const ymd = addCalendarDaysToIsoDate(startDateYmd.slice(0, 10), offsetDays);
  return `${ymd}T17:00:00.000Z`;
}

async function staffLookup(): Promise<Record<string, { full_name: string | null; email: string | null }>> {
  const { data } = await supabaseAdmin.from("staff_profiles").select("user_id, full_name, email");
  const map: Record<string, { full_name: string | null; email: string | null }> = {};
  for (const s of data ?? []) {
    map[(s as { user_id: string }).user_id] = s as { full_name: string | null; email: string | null };
  }
  return map;
}

function mapCampaign(raw: Record<string, unknown>): CampaignRow {
  return {
    id: String(raw.id),
    name: String(raw.name),
    description: typeof raw.description === "string" ? raw.description : null,
    playbook_id: typeof raw.playbook_id === "string" ? raw.playbook_id : null,
    assigned_rep_id: typeof raw.assigned_rep_id === "string" ? raw.assigned_rep_id : null,
    status: (raw.status as CampaignStatus) ?? "active",
    start_date: String(raw.start_date).slice(0, 10),
    end_date: typeof raw.end_date === "string" ? raw.end_date.slice(0, 10) : null,
    created_by: typeof raw.created_by === "string" ? raw.created_by : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

export async function listCampaigns(staff: StaffProfile): Promise<CampaignCard[]> {
  let query = supabaseAdmin.from("facility_campaigns").select("*").order("created_at", { ascending: false });

  if (isSalesAgentRole(staff) && !canAccessFacilityAdminTools(staff)) {
    query = query.or(`assigned_rep_id.eq.${staff.user_id},created_by.eq.${staff.user_id}`);
  }

  const { data: rows } = await query;
  const campaigns = (rows ?? []).map((r) => mapCampaign(r as Record<string, unknown>));
  if (campaigns.length === 0) return [];

  const ids = campaigns.map((c) => c.id);
  const playbookIds = [...new Set(campaigns.map((c) => c.playbook_id).filter(Boolean))] as string[];
  const staffById = await staffLookup();

  const [{ data: playbooks }, { data: enrollments }, { data: steps }] = await Promise.all([
    playbookIds.length
      ? supabaseAdmin.from("facility_outreach_playbooks").select("id, name").in("id", playbookIds)
      : Promise.resolve({ data: [] }),
    supabaseAdmin
      .from("facility_campaign_enrollments")
      .select("campaign_id, status")
      .in("campaign_id", ids),
    supabaseAdmin
      .from("facility_campaign_step_instances")
      .select("campaign_id, status, due_at")
      .in("campaign_id", ids),
  ]);

  const playbookNames: Record<string, string> = {};
  for (const p of playbooks ?? []) playbookNames[(p as { id: string }).id] = String((p as { name?: string }).name ?? "");

  const enrolledCount: Record<string, number> = {};
  for (const e of enrollments ?? []) {
    const cid = String((e as { campaign_id: string }).campaign_id);
    if ((e as { status: string }).status === "active" || (e as { status: string }).status === "completed") {
      enrolledCount[cid] = (enrolledCount[cid] ?? 0) + 1;
    }
  }

  const today = getCrmCalendarTodayIso();
  const stats: Record<string, { completed: number; overdue: number; open: number }> = {};
  for (const s of steps ?? []) {
    const cid = String((s as { campaign_id: string }).campaign_id);
    if (!stats[cid]) stats[cid] = { completed: 0, overdue: 0, open: 0 };
    const st = (s as { status: string }).status;
    if (st === "completed" || st === "skipped") stats[cid].completed++;
    else if (st === "open") {
      stats[cid].open++;
      const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(String((s as { due_at: string }).due_at)));
      if (dueYmd < today) stats[cid].overdue++;
    }
  }

  return campaigns.map((c) => {
    const st = stats[c.id] ?? { completed: 0, overdue: 0, open: 0 };
    const total = st.completed + st.open;
    return {
      ...c,
      playbook_name: c.playbook_id ? playbookNames[c.playbook_id] ?? null : null,
      assigned_rep_label: c.assigned_rep_id ? staffLabelFromLookup(c.assigned_rep_id, staffById) : null,
      facilities_enrolled: enrolledCount[c.id] ?? 0,
      steps_completed: st.completed,
      steps_overdue: st.overdue,
      steps_open: st.open,
      referrals_generated: 0,
      converted_referrals: 0,
      progress_pct: total > 0 ? Math.round((st.completed / total) * 100) : 0,
    };
  });
}

export async function getCampaignDetail(
  staff: StaffProfile,
  campaignId: string
): Promise<CampaignDetail | null> {
  if (!UUID_RE.test(campaignId)) return null;

  const { data: row } = await supabaseAdmin
    .from("facility_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (!row) return null;
  const campaign = mapCampaign(row as Record<string, unknown>);

  if (isSalesAgentRole(staff) && !canAccessFacilityAdminTools(staff)) {
    if (campaign.assigned_rep_id !== staff.user_id && campaign.created_by !== staff.user_id) {
      return null;
    }
  }

  const cards = await listCampaigns(staff);
  const card = cards.find((c) => c.id === campaignId);
  if (!card) return null;

  const staffById = await staffLookup();
  const { data: enrollmentRows } = await supabaseAdmin
    .from("facility_campaign_enrollments")
    .select("*")
    .eq("campaign_id", campaignId)
    .neq("status", "removed")
    .order("enrolled_at", { ascending: false });

  const facilityIds = [...new Set((enrollmentRows ?? []).map((e) => String((e as { facility_id: string }).facility_id)))];
  const facilityById: Record<string, { name: string; city: string | null; type: string | null }> = {};
  if (facilityIds.length) {
    const { data: facs } = await supabaseAdmin.from("facilities").select("id, name, city, type").in("id", facilityIds);
    for (const f of facs ?? []) {
      facilityById[(f as { id: string }).id] = {
        name: String((f as { name?: string }).name ?? "Facility"),
        city: (f as { city?: string | null }).city ?? null,
        type: (f as { type?: string | null }).type ?? null,
      };
    }
  }

  const referralCountByFacility: Record<string, number> = {};
  if (facilityIds.length) {
    const { data: referralRows } = await supabaseAdmin
      .from("leads")
      .select("referring_facility_id")
      .in("referring_facility_id", facilityIds)
      .is("deleted_at", null);
    for (const r of referralRows ?? []) {
      const fid = String((r as { referring_facility_id: string }).referring_facility_id);
      referralCountByFacility[fid] = (referralCountByFacility[fid] ?? 0) + 1;
    }
  }

  const { count: stepCount } = campaign.playbook_id
    ? await supabaseAdmin
        .from("facility_outreach_playbook_steps")
        .select("id", { count: "exact", head: true })
        .eq("playbook_id", campaign.playbook_id)
    : { count: 0 };

  const stepCards = await loadStepCardsForCampaign(campaignId, campaign.name);

  const overdueFacilityIds = new Set<string>();
  for (const s of stepCards) {
    if (s.status === "open" && s.is_overdue) overdueFacilityIds.add(s.facility_id);
  }

  const enrollments: CampaignEnrollmentCard[] = (enrollmentRows ?? []).map((e) => {
    const en = e as Record<string, unknown>;
    const fid = String(en.facility_id);
    const fac = facilityById[fid];
    const repId = typeof en.assigned_rep_id === "string" ? en.assigned_rep_id : null;
    return {
      id: String(en.id),
      campaign_id: campaignId,
      facility_id: fid,
      facility_name: fac?.name ?? "Facility",
      facility_city: fac?.city ?? null,
      facility_type: fac?.type ?? null,
      assigned_rep_id: repId,
      assigned_rep_label: repId ? staffLabelFromLookup(repId, staffById) : null,
      status: en.status as CampaignEnrollmentCard["status"],
      current_step_number: Number(en.current_step_number ?? 1),
      total_steps: stepCount ?? 0,
      next_task_id: typeof en.next_task_id === "string" ? en.next_task_id : null,
      enrolled_at: String(en.enrolled_at),
      completed_at: typeof en.completed_at === "string" ? en.completed_at : null,
      referral_count: referralCountByFacility[fid] ?? 0,
      has_overdue_step: overdueFacilityIds.has(fid),
    };
  });

  const { data: allEnrollmentsIncludingRemoved } = await supabaseAdmin
    .from("facility_campaign_enrollments")
    .select("status, current_step_number")
    .eq("campaign_id", campaignId);

  const statusCounts = { active: 0, completed: 0, paused: 0, removed: 0, not_started: 0 };
  for (const e of allEnrollmentsIncludingRemoved ?? []) {
    const st = String((e as { status: string }).status);
    if (st === "active") statusCounts.active += 1;
    else if (st === "completed") statusCounts.completed += 1;
    else if (st === "paused") statusCounts.paused += 1;
    else if (st === "removed") statusCounts.removed += 1;
    if (st === "active" && Number((e as { current_step_number?: number }).current_step_number ?? 1) === 1) {
      statusCounts.not_started += 1;
    }
  }

  const enrollment_summary = {
    total_enrolled: enrollments.length,
    active: statusCounts.active,
    completed: statusCounts.completed,
    paused: statusCounts.paused,
    removed: statusCounts.removed,
    not_started: statusCounts.not_started,
    steps_due_today: stepCards.filter((s) => s.status === "open" && s.is_due_today).length,
    steps_overdue: stepCards.filter((s) => s.status === "open" && s.is_overdue).length,
    referrals_generated: card.referrals_generated,
    converted_referrals: card.converted_referrals,
  };

  return {
    ...card,
    enrollments,
    due_steps: stepCards.filter((s) => s.status === "open" && s.is_due_today),
    overdue_steps: stepCards.filter((s) => s.status === "open" && s.is_overdue),
    enrollment_summary,
  };
}

async function loadStepCardsForCampaign(campaignId: string, campaignName: string): Promise<CampaignStepCard[]> {
  const { data: steps } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .select("*")
    .eq("campaign_id", campaignId)
    .in("status", ["open", "completed", "skipped"])
    .order("due_at");

  if (!steps?.length) return [];

  const facilityIds = [...new Set(steps.map((s) => String((s as { facility_id: string }).facility_id)))];
  const { data: facs } = await supabaseAdmin
    .from("facilities")
    .select("id, name, address_line_1, address_line_2, city, state, zip, latitude, longitude")
    .in("id", facilityIds);

  const facById: Record<string, Record<string, unknown>> = {};
  for (const f of facs ?? []) facById[(f as { id: string }).id] = f as Record<string, unknown>;

  const enrollmentIds = [...new Set(steps.map((s) => String((s as { enrollment_id: string }).enrollment_id)))];
  const totalStepsByEnrollment: Record<string, number> = {};
  for (const eid of enrollmentIds) {
    const { count } = await supabaseAdmin
      .from("facility_campaign_step_instances")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", eid);
    totalStepsByEnrollment[eid] = count ?? 0;
  }

  const { data: playbookSteps } = await supabaseAdmin
    .from("facility_outreach_playbook_steps")
    .select("id, suggested_activity_type, suggested_outcome")
    .in(
      "id",
      steps.map((s) => String((s as { playbook_step_id: string }).playbook_step_id))
    );

  const pbStepById: Record<string, PlaybookStepRow> = {};
  for (const ps of playbookSteps ?? []) {
    const id = String((ps as { id: string }).id);
    pbStepById[id] = ps as unknown as PlaybookStepRow;
  }

  const today = getCrmCalendarTodayIso();

  return steps.map((raw) => {
    const s = raw as Record<string, unknown>;
    const fid = String(s.facility_id);
    const f = facById[fid] ?? {};
    const eid = String(s.enrollment_id);
    const pbStep = pbStepById[String(s.playbook_step_id)] ?? null;
    const dueAt = String(s.due_at);
    const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(dueAt));
    const st = s.status as StepInstanceStatus;
    return {
      id: String(s.id),
      enrollment_id: eid,
      campaign_id: campaignId,
      campaign_name: campaignName,
      facility_id: fid,
      facility_name: String(f.name ?? "Facility"),
      facility_address: buildFacilityFullAddress(f as Parameters<typeof buildFacilityFullAddress>[0]),
      facility_latitude: (f.latitude as number | null) ?? null,
      facility_longitude: (f.longitude as number | null) ?? null,
      step_number: Number(s.step_number),
      total_steps: totalStepsByEnrollment[eid] ?? 0,
      title: String(s.title),
      description: null,
      due_at: dueAt,
      status: st,
      linked_task_id: typeof s.linked_task_id === "string" ? s.linked_task_id : null,
      suggested_activity_type: pbStep?.suggested_activity_type ?? null,
      suggested_outcome: pbStep?.suggested_outcome ?? null,
      is_overdue: st === "open" && dueYmd < today,
      is_due_today: st === "open" && dueYmd === today,
    };
  });
}

export type CreateCampaignInput = {
  name: string;
  description?: string | null;
  playbook_id: string;
  assigned_rep_id?: string | null;
  start_date?: string;
  status?: CampaignStatus;
};

export async function createCampaign(
  staff: StaffProfile,
  input: CreateCampaignInput
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };

  const name = input.name.trim();
  const playbookId = (input.playbook_id ?? "").trim();
  if (!name) return { ok: false, error: "missing_name" };
  if (!UUID_RE.test(playbookId)) return { ok: false, error: "invalid_playbook" };

  const playbook = await getPlaybook(playbookId);
  if (!playbook) return { ok: false, error: "playbook_not_found" };

  const startDate = (input.start_date ?? getCrmCalendarTodayIso()).slice(0, 10);
  const repId = input.assigned_rep_id && UUID_RE.test(input.assigned_rep_id) ? input.assigned_rep_id : null;

  const { data, error } = await supabaseAdmin
    .from("facility_campaigns")
    .insert({
      name,
      description: (input.description ?? "").trim() || null,
      playbook_id: playbookId,
      assigned_rep_id: repId,
      status: input.status ?? "active",
      start_date: startDate,
      created_by: staff.user_id,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) return { ok: false, error: "create_failed" };
  return { ok: true, id: String(data.id) };
}

export async function updateCampaign(
  staff: StaffProfile,
  campaignId: string,
  input: Partial<CreateCampaignInput>
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(campaignId)) return { ok: false, error: "invalid_id" };

  const patch: Record<string, unknown> = {};
  if (input.name?.trim()) patch.name = input.name.trim();
  if (input.description !== undefined) patch.description = (input.description ?? "").trim() || null;
  if (input.assigned_rep_id !== undefined) {
    patch.assigned_rep_id =
      input.assigned_rep_id && UUID_RE.test(input.assigned_rep_id) ? input.assigned_rep_id : null;
  }
  if (input.status) patch.status = input.status;
  if (input.start_date) patch.start_date = input.start_date.slice(0, 10);

  const { error } = await supabaseAdmin.from("facility_campaigns").update(patch).eq("id", campaignId);
  return error ? { ok: false, error: "update_failed" } : { ok: true };
}

export async function pauseCampaign(
  staff: StaffProfile,
  campaignId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  return updateCampaign(staff, campaignId, { status: "paused" });
}

export async function completeCampaign(
  staff: StaffProfile,
  campaignId: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canAccessFacilityAdminTools(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(campaignId)) return { ok: false, error: "invalid_id" };

  const { error } = await supabaseAdmin
    .from("facility_campaigns")
    .update({ status: "completed", end_date: getCrmCalendarTodayIso() })
    .eq("id", campaignId);

  return error ? { ok: false, error: "complete_failed" } : { ok: true };
}

export async function enrollFacilitiesInCampaign(
  staff: StaffProfile,
  campaignId: string,
  facilityIds: string[],
  options?: { assigned_rep_id?: string | null; skip_existing?: boolean }
): Promise<
  | {
      ok: true;
      enrolled_count: number;
      skipped_existing_count: number;
      enrolled: string[];
      skipped: string[];
      failed: Array<{ facility_id: string; error: string }>;
    }
  | { ok: false; error: string }
> {
  if (!canAccessFacilityAdminTools(staff) && !isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }
  if (!UUID_RE.test(campaignId)) return { ok: false, error: "invalid_campaign" };

  const { data: campaign } = await supabaseAdmin
    .from("facility_campaigns")
    .select("*")
    .eq("id", campaignId)
    .maybeSingle();

  if (!campaign) return { ok: false, error: "campaign_not_found" };
  const c = mapCampaign(campaign as Record<string, unknown>);
  if (c.status === "archived" || c.status === "completed") return { ok: false, error: "campaign_closed" };
  if (!c.playbook_id) return { ok: false, error: "missing_playbook" };

  const playbook = await getPlaybook(c.playbook_id);
  if (!playbook?.steps?.length) return { ok: false, error: "playbook_has_no_steps" };

  const repOverride =
    options?.assigned_rep_id && UUID_RE.test(options.assigned_rep_id) ? options.assigned_rep_id : null;

  const enrolled: string[] = [];
  const skipped: string[] = [];
  const failed: Array<{ facility_id: string; error: string }> = [];

  for (const facilityId of facilityIds) {
    if (!UUID_RE.test(facilityId)) {
      failed.push({ facility_id: facilityId, error: "invalid_id" });
      continue;
    }
    const result = await enrollSingleFacility(staff, c, playbook.steps, facilityId, repOverride);
    if (result.ok) {
      enrolled.push(facilityId);
    } else if (result.error === "duplicate_enrollment" && options?.skip_existing !== false) {
      skipped.push(facilityId);
    } else {
      failed.push({ facility_id: facilityId, error: result.error });
    }
  }

  return {
    ok: true,
    enrolled_count: enrolled.length,
    skipped_existing_count: skipped.length,
    enrolled,
    skipped,
    failed,
  };
}

async function enrollSingleFacility(
  staff: StaffProfile,
  campaign: CampaignRow,
  steps: PlaybookStepRow[],
  facilityId: string,
  repOverride?: string | null
): Promise<{ ok: true; enrollment_id: string } | { ok: false; error: string }> {
  const { data: existing } = await supabaseAdmin
    .from("facility_campaign_enrollments")
    .select("id")
    .eq("campaign_id", campaign.id)
    .eq("facility_id", facilityId)
    .eq("status", "active")
    .maybeSingle();

  if (existing?.id) return { ok: false, error: "duplicate_enrollment" };

  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("id, name, assigned_rep_user_id")
    .eq("id", facilityId)
    .maybeSingle();

  if (!facility?.id) return { ok: false, error: "facility_not_found" };

  const repId =
    repOverride ??
    campaign.assigned_rep_id ??
    (facility as { assigned_rep_user_id?: string | null }).assigned_rep_user_id ??
    staff.user_id;

  const { data: enrollment, error: enErr } = await supabaseAdmin
    .from("facility_campaign_enrollments")
    .insert({
      campaign_id: campaign.id,
      facility_id: facilityId,
      assigned_rep_id: repId,
      status: "active",
      current_step_number: 1,
      created_by: staff.user_id,
    })
    .select("id")
    .maybeSingle();

  if (enErr || !enrollment?.id) return { ok: false, error: "enrollment_failed" };
  const enrollmentId = String(enrollment.id);

  const stepInstances = steps.map((step) => ({
    enrollment_id: enrollmentId,
    campaign_id: campaign.id,
    facility_id: facilityId,
    playbook_step_id: step.id,
    step_number: step.step_number,
    title: step.title,
    due_at: dueAtFromStart(campaign.start_date, step.due_offset_days),
    status: "open" as const,
  }));

  const { data: insertedSteps, error: stepErr } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .insert(stepInstances)
    .select("id, step_number");

  if (stepErr || !insertedSteps?.length) {
    await supabaseAdmin.from("facility_campaign_enrollments").delete().eq("id", enrollmentId);
    return { ok: false, error: "step_instances_failed" };
  }

  const firstStep = [...steps].sort((a, b) => a.step_number - b.step_number)[0];
  const firstInstance = (insertedSteps as { id: string; step_number: number }[]).find(
    (s) => s.step_number === firstStep.step_number
  );

  if (firstInstance) {
    const taskId = await createTaskForStepInstance({
      campaign,
      enrollmentId,
      facilityId,
      facilityName: String((facility as { name?: string }).name ?? "Facility"),
      stepInstanceId: firstInstance.id,
      step: firstStep,
      dueAt: dueAtFromStart(campaign.start_date, firstStep.due_offset_days),
      assignedTo: repId,
      createdBy: staff.user_id,
    });

    if (taskId) {
      await supabaseAdmin
        .from("facility_campaign_step_instances")
        .update({ linked_task_id: taskId })
        .eq("id", firstInstance.id);

      await supabaseAdmin
        .from("facility_campaign_enrollments")
        .update({ next_task_id: taskId })
        .eq("id", enrollmentId);
    }
  }

  queueFacilityNotification(() =>
    createFacilityNotification({
      userId: repId,
      notificationType: "facility_campaign_enrolled",
      title: "Enrolled in outreach campaign",
      message: `${String((facility as { name?: string }).name ?? "Facility")} enrolled in ${campaign.name}.`,
      severity: "info",
      facilityId,
      actionUrl: `/admin/facilities/campaigns/${campaign.id}`,
      metadata: { campaign_id: campaign.id, enrollment_id: enrollmentId },
    })
  );

  return { ok: true, enrollment_id: enrollmentId };
}

async function createTaskForStepInstance(input: {
  campaign: CampaignRow;
  enrollmentId: string;
  facilityId: string;
  facilityName: string;
  stepInstanceId: string;
  step: PlaybookStepRow;
  dueAt: string;
  assignedTo: string;
  createdBy: string;
}): Promise<string | null> {
  const title = (input.step.suggested_follow_up_task ?? input.step.title).trim() || input.step.title;
  const description = [
    input.step.description,
    `Campaign: ${input.campaign.name}`,
    `Step ${input.step.step_number}: ${input.step.title}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { data, error } = await supabaseAdmin
    .from("facility_follow_up_tasks")
    .insert({
      facility_id: input.facilityId,
      assigned_to: input.assignedTo,
      title,
      description,
      due_at: input.dueAt,
      status: "open",
      priority: "Normal",
      source: "campaign",
      campaign_id: input.campaign.id,
      campaign_enrollment_id: input.enrollmentId,
      campaign_step_instance_id: input.stepInstanceId,
      created_by: input.createdBy,
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    console.warn("[facility-campaigns] task create:", error?.message);
    return null;
  }
  return String(data.id);
}

export async function completeCampaignStepInstance(
  staff: StaffProfile,
  stepInstanceId: string,
  input: { notes?: string | null; activity_id?: string | null; complete_linked_task?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(stepInstanceId)) return { ok: false, error: "invalid_step" };

  const { data: stepRow } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .select("*")
    .eq("id", stepInstanceId)
    .maybeSingle();

  if (!stepRow) return { ok: false, error: "step_not_found" };
  const step = stepRow as Record<string, unknown>;
  if (step.status !== "open") return { ok: false, error: "step_not_open" };

  const { data: enrollment } = await supabaseAdmin
    .from("facility_campaign_enrollments")
    .select("*")
    .eq("id", String(step.enrollment_id))
    .maybeSingle();

  if (!enrollment) return { ok: false, error: "enrollment_not_found" };

  const en = enrollment as Record<string, unknown>;
  if (
    isSalesAgentRole(staff) &&
    !canAccessFacilityAdminTools(staff) &&
    en.assigned_rep_id !== staff.user_id
  ) {
    return { ok: false, error: "forbidden" };
  }

  const now = new Date().toISOString();
  await supabaseAdmin
    .from("facility_campaign_step_instances")
    .update({
      status: "completed",
      completed_at: now,
      completed_by: staff.user_id,
      notes: (input.notes ?? "").trim() || null,
      linked_activity_id: input.activity_id && UUID_RE.test(input.activity_id) ? input.activity_id : null,
    })
    .eq("id", stepInstanceId);

  const linkedTaskId = typeof step.linked_task_id === "string" ? step.linked_task_id : null;
  if (linkedTaskId && input.complete_linked_task !== false) {
    await supabaseAdmin
      .from("facility_follow_up_tasks")
      .update({
        status: "completed",
        completed_at: now,
        completed_by: staff.user_id,
        completion_note: (input.notes ?? "").trim() || "Campaign step completed",
      })
      .eq("id", linkedTaskId)
      .eq("status", "open");
  }

  await advanceEnrollmentAfterStep(String(step.enrollment_id), staff.user_id);
  return { ok: true };
}

export async function skipCampaignStepInstance(
  staff: StaffProfile,
  stepInstanceId: string,
  input: { notes?: string | null }
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!UUID_RE.test(stepInstanceId)) return { ok: false, error: "invalid_step" };

  const { data: stepRow } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .select("*")
    .eq("id", stepInstanceId)
    .maybeSingle();

  if (!stepRow) return { ok: false, error: "step_not_found" };
  const step = stepRow as Record<string, unknown>;
  if (step.status !== "open") return { ok: false, error: "step_not_open" };

  await supabaseAdmin
    .from("facility_campaign_step_instances")
    .update({
      status: "skipped",
      completed_at: new Date().toISOString(),
      completed_by: staff.user_id,
      notes: (input.notes ?? "").trim() || "Skipped",
    })
    .eq("id", stepInstanceId);

  const linkedTaskId = typeof step.linked_task_id === "string" ? step.linked_task_id : null;
  if (linkedTaskId) {
    await supabaseAdmin
      .from("facility_follow_up_tasks")
      .update({ status: "canceled", completion_note: "Campaign step skipped" })
      .eq("id", linkedTaskId)
      .eq("status", "open");
  }

  await advanceEnrollmentAfterStep(String(step.enrollment_id), staff.user_id);
  return { ok: true };
}

async function advanceEnrollmentAfterStep(enrollmentId: string, userId: string): Promise<void> {
  const { data: enrollment } = await supabaseAdmin
    .from("facility_campaign_enrollments")
    .select("*")
    .eq("id", enrollmentId)
    .maybeSingle();

  if (!enrollment) return;
  const en = enrollment as Record<string, unknown>;
  if (en.status !== "active") return;

  const { data: campaign } = await supabaseAdmin
    .from("facility_campaigns")
    .select("*")
    .eq("id", String(en.campaign_id))
    .maybeSingle();

  if (!campaign) return;
  const c = mapCampaign(campaign as Record<string, unknown>);

  const { data: nextStep } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .select("*")
    .eq("enrollment_id", enrollmentId)
    .eq("status", "open")
    .order("step_number")
    .limit(1)
    .maybeSingle();

  if (!nextStep) {
    await supabaseAdmin
      .from("facility_campaign_enrollments")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        next_task_id: null,
        current_step_number: Number(en.current_step_number),
      })
      .eq("id", enrollmentId);

    const repId = typeof en.assigned_rep_id === "string" ? en.assigned_rep_id : userId;
    queueFacilityNotification(() =>
      createFacilityNotification({
        userId: repId,
        notificationType: "facility_campaign_completed",
        title: "Campaign completed for facility",
        message: `All playbook steps completed for ${c.name}.`,
        severity: "success",
        facilityId: String(en.facility_id),
        actionUrl: `/admin/facilities/campaigns/${c.id}`,
        metadata: { campaign_id: c.id, enrollment_id: enrollmentId },
      })
    );
    return;
  }

  const ns = nextStep as Record<string, unknown>;
  const stepNumber = Number(ns.step_number);

  const { data: pbStep } = await supabaseAdmin
    .from("facility_outreach_playbook_steps")
    .select("*")
    .eq("id", String(ns.playbook_step_id))
    .maybeSingle();

  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("name")
    .eq("id", String(en.facility_id))
    .maybeSingle();

  const repId = typeof en.assigned_rep_id === "string" ? en.assigned_rep_id : userId;
  let taskId: string | null = typeof ns.linked_task_id === "string" ? ns.linked_task_id : null;

  if (!taskId && pbStep) {
    taskId = await createTaskForStepInstance({
      campaign: c,
      enrollmentId,
      facilityId: String(en.facility_id),
      facilityName: String((facility as { name?: string } | null)?.name ?? "Facility"),
      stepInstanceId: String(ns.id),
      step: pbStep as unknown as PlaybookStepRow,
      dueAt: String(ns.due_at),
      assignedTo: repId,
      createdBy: userId,
    });
    if (taskId) {
      await supabaseAdmin
        .from("facility_campaign_step_instances")
        .update({ linked_task_id: taskId })
        .eq("id", String(ns.id));
    }
  }

  await supabaseAdmin
    .from("facility_campaign_enrollments")
    .update({ current_step_number: stepNumber, next_task_id: taskId })
    .eq("id", enrollmentId);
}

export async function handleCampaignTaskCompleted(
  taskId: string,
  userId: string | null,
  activityId?: string | null
): Promise<void> {
  const { data: task } = await supabaseAdmin
    .from("facility_follow_up_tasks")
    .select("campaign_step_instance_id")
    .eq("id", taskId)
    .maybeSingle();

  const stepInstanceId = (task as { campaign_step_instance_id?: string | null } | null)
    ?.campaign_step_instance_id;
  if (!stepInstanceId || !UUID_RE.test(stepInstanceId)) return;

  const { data: step } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .select("status")
    .eq("id", stepInstanceId)
    .maybeSingle();

  if (!step || (step as { status: string }).status !== "open") return;

  await supabaseAdmin
    .from("facility_campaign_step_instances")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: userId,
      linked_activity_id: activityId && UUID_RE.test(activityId) ? activityId : null,
    })
    .eq("id", stepInstanceId);

  const { data: enRow } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .select("enrollment_id")
    .eq("id", stepInstanceId)
    .maybeSingle();

  if (enRow) {
    await advanceEnrollmentAfterStep(String((enRow as { enrollment_id: string }).enrollment_id), userId ?? "");
  }
}

export async function linkActivityToCampaignStep(
  stepInstanceId: string,
  activityId: string
): Promise<void> {
  if (!UUID_RE.test(stepInstanceId) || !UUID_RE.test(activityId)) return;
  await supabaseAdmin
    .from("facility_campaign_step_instances")
    .update({ linked_activity_id: activityId })
    .eq("id", stepInstanceId);
}

export async function listDueCampaignStepsForUser(staff: StaffProfile): Promise<CampaignStepCard[]> {
  let enrollmentQuery = supabaseAdmin
    .from("facility_campaign_enrollments")
    .select("campaign_id")
    .eq("status", "active");

  if (isSalesAgentRole(staff) && !canAccessFacilityAdminTools(staff)) {
    enrollmentQuery = enrollmentQuery.eq("assigned_rep_id", staff.user_id);
  }

  const { data: enrollments } = await enrollmentQuery;
  const campaignIds = [...new Set((enrollments ?? []).map((e) => String((e as { campaign_id: string }).campaign_id)))];
  if (!campaignIds.length) return [];

  const allSteps: CampaignStepCard[] = [];
  const { data: campaigns } = await supabaseAdmin.from("facility_campaigns").select("id, name").in("id", campaignIds);
  const names: Record<string, string> = {};
  for (const c of campaigns ?? []) names[(c as { id: string }).id] = String((c as { name?: string }).name ?? "");

  for (const cid of campaignIds) {
    const steps = await loadStepCardsForCampaign(cid, names[cid] ?? "Campaign");
    allSteps.push(...steps.filter((s) => s.status === "open" && (s.is_due_today || s.is_overdue)));
  }

  return allSteps.sort((a, b) => a.due_at.localeCompare(b.due_at));
}

export async function listEnrollmentsForFacility(
  facilityId: string
): Promise<FacilityEnrollmentSummary[]> {
  if (!UUID_RE.test(facilityId)) return [];

  const { data: rows } = await supabaseAdmin
    .from("facility_campaign_enrollments")
    .select("*")
    .eq("facility_id", facilityId)
    .in("status", ["active", "completed", "paused"])
    .order("enrolled_at", { ascending: false });

  if (!rows?.length) return [];

  const campaignIds = [...new Set(rows.map((r) => String((r as { campaign_id: string }).campaign_id)))];
  const { data: campaigns } = await supabaseAdmin.from("facility_campaigns").select("id, name, playbook_id").in("id", campaignIds);
  const campaignById: Record<string, { name: string; playbook_id: string | null }> = {};
  for (const c of campaigns ?? []) {
    campaignById[(c as { id: string }).id] = {
      name: String((c as { name?: string }).name ?? ""),
      playbook_id: (c as { playbook_id?: string | null }).playbook_id ?? null,
    };
  }

  const summaries: FacilityEnrollmentSummary[] = [];
  for (const raw of rows) {
    const en = raw as Record<string, unknown>;
    const cid = String(en.campaign_id);
    const camp = campaignById[cid];
    const { count: total } = camp?.playbook_id
      ? await supabaseAdmin
          .from("facility_outreach_playbook_steps")
          .select("id", { count: "exact", head: true })
          .eq("playbook_id", camp.playbook_id)
      : { count: 0 };

    const { count: completed } = await supabaseAdmin
      .from("facility_campaign_step_instances")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", String(en.id))
      .in("status", ["completed", "skipped"]);

    const { data: currentStep } = await supabaseAdmin
      .from("facility_campaign_step_instances")
      .select("title, due_at")
      .eq("enrollment_id", String(en.id))
      .eq("status", "open")
      .order("step_number")
      .limit(1)
      .maybeSingle();

    const totalSteps = total ?? 0;
    const done = completed ?? 0;

    summaries.push({
      enrollment_id: String(en.id),
      campaign_id: cid,
      campaign_name: camp?.name ?? "Campaign",
      status: en.status as FacilityEnrollmentSummary["status"],
      current_step_number: Number(en.current_step_number ?? 1),
      total_steps: totalSteps,
      current_step_title: (currentStep as { title?: string } | null)?.title ?? null,
      next_due_at: (currentStep as { due_at?: string } | null)?.due_at ?? null,
      next_task_id: typeof en.next_task_id === "string" ? en.next_task_id : null,
      progress_pct: totalSteps > 0 ? Math.round((done / totalSteps) * 100) : 0,
    });
  }

  return summaries;
}

export async function getCampaignStepContext(
  stepInstanceId: string
): Promise<CampaignQuickLogContext | null> {
  if (!UUID_RE.test(stepInstanceId)) return null;

  const { data: step } = await supabaseAdmin
    .from("facility_campaign_step_instances")
    .select("*")
    .eq("id", stepInstanceId)
    .maybeSingle();

  if (!step) return null;
  const s = step as Record<string, unknown>;

  const [{ data: campaign }, { data: pbStep }, { count: total }] = await Promise.all([
    supabaseAdmin.from("facility_campaigns").select("name").eq("id", String(s.campaign_id)).maybeSingle(),
    supabaseAdmin
      .from("facility_outreach_playbook_steps")
      .select("*")
      .eq("id", String(s.playbook_step_id))
      .maybeSingle(),
    supabaseAdmin
      .from("facility_campaign_step_instances")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", String(s.enrollment_id)),
  ]);

  const ps = pbStep as Record<string, unknown> | null;
  return {
    step_instance_id: String(s.id),
    enrollment_id: String(s.enrollment_id),
    campaign_id: String(s.campaign_id),
    campaign_name: String((campaign as { name?: string } | null)?.name ?? "Campaign"),
    step_number: Number(s.step_number),
    total_steps: total ?? 0,
    step_title: String(s.title),
    suggested_activity_type: ps ? (ps.suggested_activity_type as string | null) : null,
    suggested_outcome: ps ? (ps.suggested_outcome as string | null) : null,
    requires_photo: ps ? Boolean(ps.requires_photo) : false,
    requires_referral_process_capture: ps ? Boolean(ps.requires_referral_process_capture) : false,
  };
}

export async function loadCampaignAnalytics(
  staff: StaffProfile,
  opts: { start_date?: string; end_date?: string; rep_id?: string | null }
): Promise<CampaignAnalyticsSummary> {
  if (!canAccessFacilityAdminTools(staff)) {
    return {
      active_campaigns: 0,
      facilities_enrolled: 0,
      steps_completed: 0,
      steps_overdue: 0,
      referrals_generated: 0,
      converted_referrals: 0,
      best_campaign_name: null,
      conversion_rate_pct: null,
      campaigns: [],
    };
  }

  const campaigns = await listCampaigns(staff);
  const active = campaigns.filter((c) => c.status === "active");
  const staffById = await staffLookup();
  const today = getCrmCalendarTodayIso();

  const rows: CampaignAnalyticsRow[] = [];
  let totalReferrals = 0;
  let totalConverted = 0;
  let bestName: string | null = null;
  let bestReferrals = -1;

  for (const c of campaigns) {
    if (opts.rep_id && c.assigned_rep_id !== opts.rep_id) continue;

    const { data: facilityIds } = await supabaseAdmin
      .from("facility_campaign_enrollments")
      .select("facility_id")
      .eq("campaign_id", c.id)
      .neq("status", "removed");

    const fids = [...new Set((facilityIds ?? []).map((r) => String((r as { facility_id: string }).facility_id)))];
    let referrals = 0;
    let converted = 0;
    let lastActivity: string | null = null;

    if (fids.length) {
      const { data: leads } = await supabaseAdmin
        .from("leads")
        .select("status, referral_received_at")
        .in("referring_facility_id", fids)
        .is("deleted_at", null);

      referrals = (leads ?? []).length;
      converted = (leads ?? []).filter((l) => (l as { status?: string }).status === "converted").length;

      const { data: acts } = await supabaseAdmin
        .from("facility_activities")
        .select("activity_at")
        .in("facility_id", fids)
        .order("activity_at", { ascending: false })
        .limit(1);

      lastActivity = (acts?.[0] as { activity_at?: string } | undefined)?.activity_at ?? null;
    }

    totalReferrals += referrals;
    totalConverted += converted;
    if (referrals > bestReferrals) {
      bestReferrals = referrals;
      bestName = c.name;
    }

    const { count: followUpsDone } = await supabaseAdmin
      .from("facility_follow_up_tasks")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", c.id)
      .eq("status", "completed");

    rows.push({
      campaign_id: c.id,
      campaign_name: c.name,
      playbook_name: c.playbook_name,
      rep_label: c.assigned_rep_label,
      facilities_enrolled: c.facilities_enrolled,
      progress_pct: c.progress_pct,
      steps_completed: c.steps_completed,
      steps_overdue: c.steps_overdue,
      activities_generated: 0,
      follow_ups_completed: followUpsDone ?? 0,
      referrals_created: referrals,
      converted_patients: converted,
      last_activity_at: lastActivity,
    });
  }

  return {
    active_campaigns: active.length,
    facilities_enrolled: campaigns.reduce((s, c) => s + c.facilities_enrolled, 0),
    steps_completed: campaigns.reduce((s, c) => s + c.steps_completed, 0),
    steps_overdue: campaigns.reduce((s, c) => s + c.steps_overdue, 0),
    referrals_generated: totalReferrals,
    converted_referrals: totalConverted,
    best_campaign_name: bestName,
    conversion_rate_pct: totalReferrals > 0 ? Math.round((totalConverted / totalReferrals) * 100) : null,
    campaigns: rows,
  };
}

export async function syncCampaignStepNotifications(staff: StaffProfile): Promise<void> {
  const steps = await listDueCampaignStepsForUser(staff);
  const today = getCrmCalendarTodayIso();

  for (const step of steps) {
    const type = step.is_overdue ? "facility_campaign_step_overdue" : "facility_campaign_step_due";
    await createFacilityNotification({
      userId: staff.user_id,
      notificationType: type,
      title: step.is_overdue ? "Overdue campaign step" : "Campaign step due today",
      message: `${step.campaign_name}: ${step.title} at ${step.facility_name}`,
      severity: step.is_overdue ? "warning" : "info",
      facilityId: step.facility_id,
      taskId: step.linked_task_id,
      actionUrl: `/admin/facilities/campaigns/${step.campaign_id}`,
      metadata: { step_instance_id: step.id, campaign_id: step.campaign_id },
    });
  }
}
