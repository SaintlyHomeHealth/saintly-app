import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import { handleCampaignTaskCompleted } from "@/lib/crm/facility-campaigns";
import {
  getCrmCalendarDateIsoFromInstant,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import type {
  FollowUpTaskCard,
  FollowUpTaskPriority,
  FollowUpTaskRow,
  FollowUpTaskSource,
  FollowUpTaskStatus,
  FollowUpTaskSummary,
} from "@/lib/crm/facility-follow-up-task-types";
import type { StaffProfile } from "@/lib/staff-profile";
import { isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function followUpTaskTitleFromOutcome(outcome: string | null | undefined): string {
  const o = (outcome ?? "").trim();
  switch (o) {
    case "Wants Packet Faxed":
      return "Fax packet and follow up";
    case "Wants Email Info":
      return "Send email info and follow up";
    case "Asked to Follow Up":
      return "Follow up with facility";
    case "Left Materials":
      return "Follow up after materials drop";
    case "Met Decision Maker":
      return "Follow up with decision maker";
    case "Referral Sent":
      return "Check referral status";
    default:
      return "Follow up with facility";
  }
}

function normalizeTitle(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function titlesSimilar(a: string, b: string): boolean {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (na === nb) return true;
  if (na.length >= 8 && nb.length >= 8 && (na.includes(nb) || nb.includes(na))) return true;
  return false;
}

function sameDueCalendarDay(a: string, b: string): boolean {
  return getCrmCalendarDateIsoFromInstant(new Date(a)) === getCrmCalendarDateIsoFromInstant(new Date(b));
}

function mapFacilityPriority(p: string | null): FollowUpTaskPriority {
  if (p === "High" || p === "Low") return p;
  return "Normal";
}

export function effectiveTaskDueAt(task: Pick<FollowUpTaskRow, "status" | "due_at" | "snoozed_until">): string {
  if (task.status === "snoozed" && task.snoozed_until) {
    const snoozeEnd = new Date(task.snoozed_until);
    if (snoozeEnd.getTime() > Date.now()) return task.snoozed_until;
  }
  return task.due_at;
}

export function effectiveTaskStatus(
  task: Pick<FollowUpTaskRow, "status" | "snoozed_until">
): FollowUpTaskStatus {
  if (task.status === "snoozed" && task.snoozed_until) {
    if (new Date(task.snoozed_until).getTime() <= Date.now()) return "open";
  }
  return task.status;
}

function staffLabel(
  userId: string | null,
  staffById: Record<string, { full_name: string | null; email: string | null }>
): string | null {
  if (!userId) return null;
  const s = staffById[userId];
  if (!s) return null;
  return (s.full_name ?? "").trim() || (s.email ?? "").trim() || null;
}

export type SyncFollowUpTaskInput = {
  facility_id: string;
  activity_id?: string | null;
  contact_id?: string | null;
  follow_up_task?: string | null;
  outcome?: string | null;
  next_follow_up_at: string;
  source: FollowUpTaskSource;
  created_by: string | null;
  description?: string | null;
};

export async function syncFollowUpTaskFromActivity(
  supabase: SupabaseClient,
  input: SyncFollowUpTaskInput
): Promise<{ ok: true; task_id: string | null } | { ok: false; error: string }> {
  const due_at = new Date(input.next_follow_up_at);
  if (Number.isNaN(due_at.getTime())) return { ok: false, error: "invalid_due_at" };

  const title =
    (input.follow_up_task ?? "").trim() ||
    followUpTaskTitleFromOutcome(input.outcome);

  const { data: facility } = await supabase
    .from("facilities")
    .select("id, assigned_rep_user_id, priority")
    .eq("id", input.facility_id)
    .maybeSingle();

  if (!facility?.id) return { ok: false, error: "facility_not_found" };

  const assigned_to =
    (facility as { assigned_rep_user_id?: string | null }).assigned_rep_user_id ??
    input.created_by;

  const { data: existingRows } = await supabase
    .from("facility_follow_up_tasks")
    .select("*")
    .eq("facility_id", input.facility_id)
    .in("status", ["open", "snoozed"])
    .limit(20);

  const dueIso = due_at.toISOString();
  for (const row of existingRows ?? []) {
    const t = row as FollowUpTaskRow;
    if (sameDueCalendarDay(t.due_at, dueIso) && titlesSimilar(t.title, title)) {
      const { data: updated, error } = await supabase
        .from("facility_follow_up_tasks")
        .update({
          title,
          description: (input.description ?? "").trim() || t.description,
          due_at: dueIso,
          activity_id: input.activity_id ?? t.activity_id,
          contact_id: input.contact_id ?? t.contact_id,
          assigned_to: assigned_to ?? t.assigned_to,
          source: input.source,
          status: "open",
          snoozed_until: null,
          priority: mapFacilityPriority((facility as { priority?: string }).priority ?? null),
        })
        .eq("id", t.id)
        .select("id")
        .maybeSingle();

      if (error) {
        console.warn("[follow-up-task] update:", error.message);
        return { ok: false, error: "update_failed" };
      }
      return { ok: true, task_id: (updated?.id as string) ?? t.id };
    }
  }

  const { data: inserted, error: insErr } = await supabase
    .from("facility_follow_up_tasks")
    .insert({
      facility_id: input.facility_id,
      activity_id: input.activity_id ?? null,
      contact_id: input.contact_id ?? null,
      assigned_to,
      title,
      description: (input.description ?? "").trim() || null,
      due_at: dueIso,
      status: "open",
      priority: mapFacilityPriority((facility as { priority?: string }).priority ?? null),
      source: input.source,
      created_by: input.created_by,
    })
    .select("id")
    .maybeSingle();

  if (insErr || !inserted?.id) {
    console.warn("[follow-up-task] insert:", insErr?.message);
    return { ok: false, error: "insert_failed" };
  }

  return { ok: true, task_id: inserted.id as string };
}

type TaskQueryOpts = {
  status?: FollowUpTaskStatus | null;
  assigned_to?: string | null;
  due?: "overdue" | "today" | "upcoming" | "all" | null;
  facility_id?: string | null;
  limit?: number;
};

function taskMatchesDueFilter(task: FollowUpTaskRow, due: TaskQueryOpts["due"], today: string): boolean {
  const effStatus = effectiveTaskStatus(task);
  if (effStatus !== "open" && due !== "all") {
    if (due === "overdue" || due === "today" || due === "upcoming") return false;
  }
  if (effStatus === "completed" || effStatus === "canceled") {
    return due === "all" || !due;
  }

  const effDue = effectiveTaskDueAt(task);
  const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(effDue));

  if (!due || due === "all") return true;
  if (due === "overdue") return dueYmd < today && effStatus === "open";
  if (due === "today") return dueYmd === today && effStatus === "open";
  if (due === "upcoming") return dueYmd > today && effStatus === "open";
  return true;
}

export async function listFollowUpTasks(
  supabase: SupabaseClient,
  staff: StaffProfile,
  opts: TaskQueryOpts
): Promise<{ tasks: FollowUpTaskCard[]; summary: FollowUpTaskSummary }> {
  const today = getCrmCalendarTodayIso();
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

  let query = supabase
    .from("facility_follow_up_tasks")
    .select("*")
    .order("due_at", { ascending: true })
    .limit(limit * 3);

  if (opts.status) query = query.eq("status", opts.status);
  if (opts.facility_id && UUID_RE.test(opts.facility_id)) {
    query = query.eq("facility_id", opts.facility_id);
  }

  const canSeeAll = isManagerOrHigher(staff) || isAdminOrHigher(staff);
  if (!canSeeAll) {
    query = query.or(`assigned_to.eq.${staff.user_id},created_by.eq.${staff.user_id}`);
  } else if (opts.assigned_to && UUID_RE.test(opts.assigned_to)) {
    query = query.eq("assigned_to", opts.assigned_to);
  }

  const { data: rows } = await query;
  const allTasks = (rows ?? []) as FollowUpTaskRow[];

  const filtered = allTasks.filter((t) => {
    if (opts.due && opts.status !== "completed" && opts.status !== "canceled") {
      return taskMatchesDueFilter(t, opts.due, today);
    }
    return true;
  }).slice(0, limit);

  const facilityIds = [...new Set(filtered.map((t) => t.facility_id))];
  const contactIds = [...new Set(filtered.map((t) => t.contact_id).filter(Boolean))] as string[];

  const facilityById: Record<string, Record<string, unknown>> = {};
  if (facilityIds.length > 0) {
    const { data: facRows } = await supabase
      .from("facilities")
      .select(
        "id, name, city, type, main_phone, address_line_1, address_line_2, state, zip, latitude, longitude"
      )
      .in("id", facilityIds);
    for (const f of facRows ?? []) {
      facilityById[(f as { id: string }).id] = f as Record<string, unknown>;
    }
  }

  const contactById: Record<string, string> = {};
  if (contactIds.length > 0) {
    const { data: cRows } = await supabase
      .from("facility_contacts")
      .select("id, full_name, first_name, last_name")
      .in("id", contactIds);
    for (const c of cRows ?? []) {
      const row = c as { id: string; full_name: string | null; first_name: string | null; last_name: string | null };
      contactById[row.id] =
        (row.full_name ?? "").trim() ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        "Contact";
    }
  }

  const { data: staffRows } = await supabase.from("staff_profiles").select("user_id, full_name, email");
  const staffById: Record<string, { full_name: string | null; email: string | null }> = {};
  for (const s of staffRows ?? []) {
    staffById[(s as { user_id: string }).user_id] = s as {
      full_name: string | null;
      email: string | null;
    };
  }

  const campaignIds = [...new Set(filtered.map((t) => (t as FollowUpTaskRow).campaign_id).filter(Boolean))] as string[];
  const campaignNames: Record<string, string> = {};
  if (campaignIds.length) {
    const { data: camps } = await supabase.from("facility_campaigns").select("id, name").in("id", campaignIds);
    for (const c of camps ?? []) campaignNames[(c as { id: string }).id] = String((c as { name?: string }).name ?? "");
  }

  const stepInstanceIds = [
    ...new Set(filtered.map((t) => (t as FollowUpTaskRow).campaign_step_instance_id).filter(Boolean)),
  ] as string[];
  const stepMeta: Record<string, { step_number: number; total: number }> = {};
  for (const sid of stepInstanceIds) {
    const { data: inst } = await supabase
      .from("facility_campaign_step_instances")
      .select("step_number, enrollment_id")
      .eq("id", sid)
      .maybeSingle();
    if (inst) {
      const { count } = await supabase
        .from("facility_campaign_step_instances")
        .select("id", { count: "exact", head: true })
        .eq("enrollment_id", (inst as { enrollment_id: string }).enrollment_id);
      stepMeta[sid] = { step_number: Number((inst as { step_number: number }).step_number), total: count ?? 0 };
    }
  }

  const cards: FollowUpTaskCard[] = filtered.map((t) => {
    const f = facilityById[t.facility_id] ?? {};
    const effDue = effectiveTaskDueAt(t);
    const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(effDue));
    const cid = t.campaign_id ?? null;
    const sid = t.campaign_step_instance_id ?? null;
    const sm = sid ? stepMeta[sid] : null;
    return {
      ...t,
      facility_name: String(f.name ?? "Facility"),
      facility_city: (f.city as string | null) ?? null,
      facility_type: (f.type as string | null) ?? null,
      facility_phone: (f.main_phone as string | null) ?? null,
      facility_address: buildFacilityFullAddress(f as Parameters<typeof buildFacilityFullAddress>[0]),
      facility_latitude: (f.latitude as number | null) ?? null,
      facility_longitude: (f.longitude as number | null) ?? null,
      contact_name: t.contact_id ? contactById[t.contact_id] ?? null : null,
      assigned_to_label: staffLabel(t.assigned_to, staffById),
      is_overdue: dueYmd < today && effectiveTaskStatus(t) === "open",
      is_due_today: dueYmd === today && effectiveTaskStatus(t) === "open",
      effective_due_at: effDue,
      campaign_id: cid,
      campaign_name: cid ? campaignNames[cid] ?? null : null,
      campaign_step_number: sm?.step_number ?? null,
      campaign_total_steps: sm?.total ?? null,
    };
  });

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  let summaryQuery = supabase
    .from("facility_follow_up_tasks")
    .select("id, status, due_at, snoozed_until, completed_at")
    .limit(3000);

  if (!canSeeAll) {
    summaryQuery = summaryQuery.or(`assigned_to.eq.${staff.user_id},created_by.eq.${staff.user_id}`);
  }

  const { data: summaryRows } = await summaryQuery;
  const summaryTasks = (summaryRows ?? []) as FollowUpTaskRow[];

  let overdue = 0;
  let dueToday = 0;
  let upcoming = 0;
  let completedThisWeek = 0;

  for (const t of summaryTasks) {
    if (taskMatchesDueFilter(t, "overdue", today)) overdue++;
    if (taskMatchesDueFilter(t, "today", today)) dueToday++;
    if (taskMatchesDueFilter(t, "upcoming", today)) upcoming++;
    if (
      t.status === "completed" &&
      t.completed_at &&
      new Date(t.completed_at).getTime() >= weekAgo.getTime()
    ) {
      completedThisWeek++;
    }
  }

  return {
    tasks: cards,
    summary: {
      overdue,
      due_today: dueToday,
      upcoming,
      completed_this_week: completedThisWeek,
    },
  };
}

export async function completeFollowUpTask(
  supabase: SupabaseClient,
  taskId: string,
  userId: string | null,
  input: { completion_note?: string | null; create_activity?: boolean }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: task } = await supabase
    .from("facility_follow_up_tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  if (!task?.id) return { ok: false, error: "task_not_found" };
  const t = task as FollowUpTaskRow;

  const { error } = await supabase
    .from("facility_follow_up_tasks")
    .update({
      status: "completed",
      completed_at: new Date().toISOString(),
      completed_by: userId,
      completion_note: (input.completion_note ?? "").trim() || null,
      snoozed_until: null,
    })
    .eq("id", taskId);

  if (error) return { ok: false, error: "complete_failed" };

  if (input.create_activity !== false) {
    const note = (input.completion_note ?? "").trim() || `Completed follow-up: ${t.title}`;
    const { data: act } = await supabase.from("facility_activities").insert({
      facility_id: t.facility_id,
      facility_contact_id: t.contact_id,
      staff_user_id: userId,
      activity_type: "Follow-Up Visit",
      outcome: "Asked to Follow Up",
      activity_at: new Date().toISOString(),
      notes: note,
      follow_up_task: t.title,
    }).select("id").maybeSingle();

    if (t.campaign_step_instance_id) {
      await handleCampaignTaskCompleted(taskId, userId, act?.id ? String(act.id) : null);
    }
  } else if (t.campaign_step_instance_id) {
    await handleCampaignTaskCompleted(taskId, userId, null);
  }

  return { ok: true };
}

export async function snoozeFollowUpTask(
  supabase: SupabaseClient,
  taskId: string,
  snoozed_until: string,
  reason?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = new Date(snoozed_until);
  if (Number.isNaN(d.getTime())) return { ok: false, error: "invalid_date" };

  const { data: task } = await supabase
    .from("facility_follow_up_tasks")
    .select("description")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { ok: false, error: "task_not_found" };

  const desc = (task as { description: string | null }).description ?? "";
  const reasonNote = (reason ?? "").trim();
  const newDesc = reasonNote
    ? [desc, `Snoozed: ${reasonNote}`].filter(Boolean).join("\n")
    : desc || null;

  const { error } = await supabase
    .from("facility_follow_up_tasks")
    .update({
      status: "snoozed",
      snoozed_until: d.toISOString(),
      description: newDesc,
    })
    .eq("id", taskId);

  if (error) return { ok: false, error: "snooze_failed" };
  return { ok: true };
}

export async function rescheduleFollowUpTask(
  supabase: SupabaseClient,
  taskId: string,
  due_at: string,
  note?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const d = new Date(due_at);
  if (Number.isNaN(d.getTime())) return { ok: false, error: "invalid_date" };

  const { data: task } = await supabase
    .from("facility_follow_up_tasks")
    .select("description")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { ok: false, error: "task_not_found" };

  const desc = (task as { description: string | null }).description ?? "";
  const noteText = (note ?? "").trim();
  const newDesc = noteText
    ? [desc, `Rescheduled: ${noteText}`].filter(Boolean).join("\n")
    : desc || null;

  const { error } = await supabase
    .from("facility_follow_up_tasks")
    .update({
      status: "open",
      due_at: d.toISOString(),
      snoozed_until: null,
      description: newDesc,
    })
    .eq("id", taskId);

  if (error) return { ok: false, error: "reschedule_failed" };
  return { ok: true };
}

export async function cancelFollowUpTask(
  supabase: SupabaseClient,
  taskId: string,
  reason?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: task } = await supabase
    .from("facility_follow_up_tasks")
    .select("description")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) return { ok: false, error: "task_not_found" };

  const desc = (task as { description: string | null }).description ?? "";
  const reasonText = (reason ?? "").trim();
  const newDesc = reasonText
    ? [desc, `Canceled: ${reasonText}`].filter(Boolean).join("\n")
    : desc || null;

  const { error } = await supabase
    .from("facility_follow_up_tasks")
    .update({
      status: "canceled",
      description: newDesc,
    })
    .eq("id", taskId);

  if (error) return { ok: false, error: "cancel_failed" };
  return { ok: true };
}
