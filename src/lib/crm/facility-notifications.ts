import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import {
  getCrmCalendarDateIsoFromInstant,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import { effectiveTaskDueAt, effectiveTaskStatus } from "@/lib/crm/facility-follow-up-tasks";
import type { FollowUpTaskRow } from "@/lib/crm/facility-follow-up-task-types";
import type {
  FacilityDailyAlertSummary,
  FacilityManagerAlertRow,
  FacilityNotificationRow,
  FacilityNotificationSeverity,
  FacilityNotificationSummary,
  FacilityNotificationType,
} from "@/lib/crm/facility-notification-types";
import {
  isFacilitySourcedLead,
  pipelineStageForLeadStatus,
  referralAgeDays,
} from "@/lib/crm/facility-referral-pipeline-utils";
import type { StaffProfile } from "@/lib/staff-profile";
import {
  canAccessFacilityAdminTools,
  canAccessFacilityFieldTools,
  isManagerOrHigher,
  isSalesAgentRole,
} from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreateFacilityNotificationInput = {
  userId: string;
  notificationType: FacilityNotificationType;
  title: string;
  message?: string | null;
  severity?: FacilityNotificationSeverity;
  actionUrl?: string | null;
  facilityId?: string | null;
  leadId?: string | null;
  taskId?: string | null;
  activityId?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string;
};

function mapRow(raw: Record<string, unknown>): FacilityNotificationRow {
  return {
    id: String(raw.id),
    user_id: String(raw.user_id),
    facility_id: typeof raw.facility_id === "string" ? raw.facility_id : null,
    lead_id: typeof raw.lead_id === "string" ? raw.lead_id : null,
    task_id: typeof raw.task_id === "string" ? raw.task_id : null,
    activity_id: typeof raw.activity_id === "string" ? raw.activity_id : null,
    notification_type: raw.notification_type as FacilityNotificationType,
    title: String(raw.title),
    message: typeof raw.message === "string" ? raw.message : null,
    severity: (raw.severity as FacilityNotificationSeverity) ?? "info",
    status: (raw.status as FacilityNotificationRow["status"]) ?? "unread",
    action_url: typeof raw.action_url === "string" ? raw.action_url : null,
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : null,
    dedupe_key: typeof raw.dedupe_key === "string" ? raw.dedupe_key : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    read_at: typeof raw.read_at === "string" ? raw.read_at : null,
    dismissed_at: typeof raw.dismissed_at === "string" ? raw.dismissed_at : null,
  };
}

export function buildFacilityNotificationDedupeKey(
  notificationType: string,
  ids: { facilityId?: string | null; leadId?: string | null; taskId?: string | null },
  dayYmd: string = getCrmCalendarTodayIso()
): string {
  return `${notificationType}:${ids.facilityId ?? ""}:${ids.leadId ?? ""}:${ids.taskId ?? ""}:${dayYmd}`;
}

export async function createFacilityNotification(
  input: CreateFacilityNotificationInput
): Promise<{ id: string | null; updated: boolean }> {
  if (!UUID_RE.test(input.userId)) return { id: null, updated: false };

  const dedupeKey =
    input.dedupeKey ??
    buildFacilityNotificationDedupeKey(input.notificationType, {
      facilityId: input.facilityId,
      leadId: input.leadId,
      taskId: input.taskId,
    });

  const { data: existing } = await supabaseAdmin
    .from("facility_notifications")
    .select("id")
    .eq("user_id", input.userId)
    .eq("dedupe_key", dedupeKey)
    .eq("status", "unread")
    .maybeSingle();

  const payload = {
    title: input.title,
    message: input.message ?? null,
    severity: input.severity ?? "info",
    action_url: input.actionUrl ?? null,
    facility_id: input.facilityId ?? null,
    lead_id: input.leadId ?? null,
    task_id: input.taskId ?? null,
    activity_id: input.activityId ?? null,
    metadata: input.metadata ?? {},
    dedupe_key: dedupeKey,
    notification_type: input.notificationType,
  };

  if (existing?.id) {
    const { error } = await supabaseAdmin
      .from("facility_notifications")
      .update({ ...payload, created_at: new Date().toISOString() })
      .eq("id", existing.id);
    if (error) {
      console.warn("[facility-notifications] update dedupe:", error.message);
      return { id: null, updated: false };
    }
    return { id: String(existing.id), updated: true };
  }

  const { data, error } = await supabaseAdmin
    .from("facility_notifications")
    .insert({ user_id: input.userId, status: "unread", ...payload })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") return { id: null, updated: true };
    console.warn("[facility-notifications] insert:", error.message);
    return { id: null, updated: false };
  }

  return { id: data?.id ? String(data.id) : null, updated: false };
}

export async function listFacilityNotifications(
  staff: StaffProfile,
  opts: { status?: "unread" | "read" | "all"; limit?: number; type?: FacilityNotificationType | null }
): Promise<{ notifications: FacilityNotificationRow[]; summary: FacilityNotificationSummary }> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);

  let query = supabaseAdmin
    .from("facility_notifications")
    .select("*")
    .eq("user_id", staff.user_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (opts.status === "unread") query = query.eq("status", "unread");
  else if (opts.status === "read") query = query.eq("status", "read");
  else if (opts.status !== "all") query = query.neq("status", "dismissed");

  if (opts.type) query = query.eq("notification_type", opts.type);

  const { data: rows, error } = await query;
  if (error) {
    console.warn("[facility-notifications] list:", error.message);
    return { notifications: [], summary: { unread: 0, urgent: 0, warnings: 0 } };
  }

  const notifications = (rows ?? []).map((r) => mapRow(r as Record<string, unknown>));

  const [{ count: unread }, { count: urgent }, { count: warnings }] = await Promise.all([
    supabaseAdmin
      .from("facility_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", staff.user_id)
      .eq("status", "unread"),
    supabaseAdmin
      .from("facility_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", staff.user_id)
      .eq("status", "unread")
      .eq("severity", "urgent"),
    supabaseAdmin
      .from("facility_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", staff.user_id)
      .eq("status", "unread")
      .eq("severity", "warning"),
  ]);

  return {
    notifications,
    summary: { unread: unread ?? 0, urgent: urgent ?? 0, warnings: warnings ?? 0 },
  };
}

export async function markFacilityNotificationRead(
  staff: StaffProfile,
  notificationId: string
): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(notificationId)) return { ok: false };
  const { error } = await supabaseAdmin
    .from("facility_notifications")
    .update({ status: "read", read_at: new Date().toISOString() })
    .eq("id", notificationId)
    .eq("user_id", staff.user_id);
  return { ok: !error };
}

export async function dismissFacilityNotification(
  staff: StaffProfile,
  notificationId: string
): Promise<{ ok: boolean }> {
  if (!UUID_RE.test(notificationId)) return { ok: false };
  const { error } = await supabaseAdmin
    .from("facility_notifications")
    .update({
      status: "dismissed",
      dismissed_at: new Date().toISOString(),
      read_at: new Date().toISOString(),
    })
    .eq("id", notificationId)
    .eq("user_id", staff.user_id);
  return { ok: !error };
}

export function queueFacilityNotification(fn: () => Promise<void>): void {
  void fn().catch((e) => console.warn("[facility-notifications] async:", e));
}

async function listManagerUserIds(): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, role, is_active")
    .eq("is_active", true);
  return (data ?? [])
    .filter((r) => isManagerOrHigher({ role: (r as { role: string }).role } as StaffProfile))
    .map((r) => String((r as { user_id: string }).user_id))
    .filter((id) => UUID_RE.test(id));
}

function overdueSeverity(daysOverdue: number): FacilityNotificationSeverity {
  if (daysOverdue >= 3) return "urgent";
  if (daysOverdue >= 1) return "warning";
  return "info";
}

function daysBetweenYmd(fromYmd: string, toYmd: string): number {
  const [fy, fm, fd] = fromYmd.split("-").map(Number);
  const [ty, tm, td] = toYmd.split("-").map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.max(0, Math.round((to - from) / 86400000));
}

const WARM_OUTCOMES = new Set([
  "Wants Packet Faxed",
  "Wants Email Info",
  "Asked to Follow Up",
  "Met Decision Maker",
  "Good Conversation",
  "Referral Sent",
]);

function isWarmActivityRow(row: {
  activity_type?: string | null;
  outcome?: string | null;
  referral_potential?: string | null;
  decision_maker_met?: boolean | null;
}): boolean {
  if (row.activity_type === "Referral Received") return true;
  if (row.outcome && WARM_OUTCOMES.has(row.outcome)) return true;
  if (row.referral_potential === "Warm" || row.referral_potential === "Hot") return true;
  if (row.decision_maker_met) return true;
  return false;
}

export async function notifyFollowUpTaskAssigned(input: {
  taskId: string;
  facilityId: string;
  facilityName: string;
  title: string;
  assignedToUserId: string | null;
  dueAt: string;
}): Promise<void> {
  if (!input.assignedToUserId || !UUID_RE.test(input.assignedToUserId)) return;
  await createFacilityNotification({
    userId: input.assignedToUserId,
    notificationType: "facility_task_assigned",
    title: "Follow-up task assigned",
    message: `${input.facilityName}: ${input.title}`,
    severity: "info",
    facilityId: input.facilityId,
    taskId: input.taskId,
    actionUrl: `/admin/facilities/follow-ups?task=${input.taskId}`,
    metadata: { due_at: input.dueAt },
  });
}

export async function notifyReferralSourceReviewNeeded(input: {
  leadId: string;
  patientName: string;
  typedFacilityName: string;
}): Promise<void> {
  const msg = `Printed QR referral for ${input.patientName} from “${input.typedFacilityName}” needs source review.`;
  const managerIds = await listManagerUserIds();
  await Promise.all(
    managerIds.map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "facility_referral_source_review_needed",
        title: "Referral source needs review",
        message: msg,
        severity: "warning",
        leadId: input.leadId,
        actionUrl: `/admin/facilities/source-review?lead=${input.leadId}`,
        dedupeKey: `facility_referral_source_review_needed:${input.leadId}`,
      })
    )
  );
}

export async function notifyReferralSourceReviewCompleted(input: {
  leadId: string;
  facilityId: string | null;
  facilityName: string | null;
  patientName: string;
  salesRepUserId: string | null;
  matched: boolean;
}): Promise<void> {
  const msg = input.matched
    ? `Referral source matched to ${input.facilityName ?? "facility"} for ${input.patientName}.`
    : `Referral source review completed for ${input.patientName} (no facility attached).`;

  const targets = new Set<string>();
  if (input.salesRepUserId && UUID_RE.test(input.salesRepUserId)) targets.add(input.salesRepUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "facility_referral_source_review_completed",
        title: input.matched ? "Referral source matched" : "Referral source reviewed",
        message: msg,
        severity: input.matched ? "success" : "info",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: input.matched && input.facilityId
          ? `/admin/facilities/${input.facilityId}`
          : `/admin/crm/leads/${input.leadId}`,
        dedupeKey: `facility_referral_source_review_completed:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyFacilityReferralCreated(input: {
  leadId: string;
  facilityId: string;
  facilityName: string;
  patientName: string;
  intakeOwnerUserId: string | null;
  salesRepUserId: string | null;
}): Promise<void> {
  const msg = `${input.facilityName} sent a referral for ${input.patientName}.`;
  if (input.intakeOwnerUserId && UUID_RE.test(input.intakeOwnerUserId)) {
    await createFacilityNotification({
      userId: input.intakeOwnerUserId,
      notificationType: "facility_referral_created",
      title: "New facility referral",
      message: msg,
      severity: "info",
      facilityId: input.facilityId,
      leadId: input.leadId,
      actionUrl: `/admin/facilities/referrals?facility_id=${input.facilityId}`,
    });
  }
  if (
    input.salesRepUserId &&
    UUID_RE.test(input.salesRepUserId) &&
    input.salesRepUserId !== input.intakeOwnerUserId
  ) {
    await createFacilityNotification({
      userId: input.salesRepUserId,
      notificationType: "facility_referral_created",
      title: "Referral created from your source",
      message: `${input.facilityName} referral is now in intake.`,
      severity: "success",
      facilityId: input.facilityId,
      leadId: input.leadId,
      actionUrl: `/admin/facilities/referrals?facility_id=${input.facilityId}`,
    });
  }
}

export async function notifyPacketReferralLinkSubmitted(input: {
  leadId: string;
  facilityId: string;
  facilityName: string;
  salesRepUserId: string | null;
  packetRequestId: string | null;
}): Promise<void> {
  const msg = `${input.facilityName} submitted a referral through the packet link.`;
  const targets = new Set<string>();
  if (input.salesRepUserId && UUID_RE.test(input.salesRepUserId)) targets.add(input.salesRepUserId);

  if (!targets.size && input.packetRequestId && UUID_RE.test(input.packetRequestId)) {
    const { data } = await supabaseAdmin
      .from("facility_packet_requests")
      .select("assigned_to, requested_by_user_id")
      .eq("id", input.packetRequestId)
      .maybeSingle();
    const assigned = (data as { assigned_to?: string; requested_by_user_id?: string } | null)?.assigned_to;
    const requested = (data as { requested_by_user_id?: string } | null)?.requested_by_user_id;
    if (assigned && UUID_RE.test(assigned)) targets.add(assigned);
    else if (requested && UUID_RE.test(requested)) targets.add(requested);
  }

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "facility_qr_referral_submitted",
        title: "Referral submitted from packet link",
        message: msg,
        severity: "success",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: input.packetRequestId
          ? `/admin/facilities/packets?status=sent`
          : `/admin/facilities/referrals?facility_id=${input.facilityId}`,
        metadata: { packet_request_id: input.packetRequestId },
        dedupeKey: `facility_qr_referral_submitted:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyLeadReferralDocumentsUploaded(input: {
  leadId: string;
  facilityId: string | null;
  facilityName: string | null;
  patientName: string;
  documentCount: number;
  intakeOwnerUserId: string | null;
  salesRepUserId: string | null;
}): Promise<void> {
  const facilityLabel = input.facilityName?.trim() || "Referral source";
  const msg = `${facilityLabel} included ${input.documentCount} document${input.documentCount === 1 ? "" : "s"} with referral for ${input.patientName}.`;
  const targets = new Set<string>();
  if (input.intakeOwnerUserId && UUID_RE.test(input.intakeOwnerUserId)) targets.add(input.intakeOwnerUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);
  if (input.salesRepUserId && UUID_RE.test(input.salesRepUserId)) targets.add(input.salesRepUserId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_referral_documents_uploaded",
        title: "Referral documents uploaded",
        message: msg,
        severity: "info",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}#section-referral-documents`,
        dedupeKey: `lead_referral_documents_uploaded:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyLeadReferralDocumentReviewNeeded(input: {
  leadId: string;
  facilityId: string | null;
  patientName: string;
  documentCount: number;
  intakeOwnerUserId: string | null;
}): Promise<void> {
  const msg = `${input.documentCount} referral document${input.documentCount === 1 ? "" : "s"} for ${input.patientName} need intake review.`;
  const targets = new Set<string>();
  if (input.intakeOwnerUserId && UUID_RE.test(input.intakeOwnerUserId)) targets.add(input.intakeOwnerUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_referral_document_review_needed",
        title: "Referral documents need review",
        message: msg,
        severity: "warning",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}#section-referral-documents`,
        dedupeKey: `lead_referral_document_review_needed:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyLeadReferralDocumentUploadFailed(input: {
  leadId: string;
  facilityId: string | null;
  patientName: string;
  intakeOwnerUserId: string | null;
}): Promise<void> {
  const msg = `Referral for ${input.patientName} was saved, but document upload failed. Follow up with the referral source.`;
  const targets = new Set<string>();
  if (input.intakeOwnerUserId && UUID_RE.test(input.intakeOwnerUserId)) targets.add(input.intakeOwnerUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_referral_document_upload_failed",
        title: "Referral document upload failed",
        message: msg,
        severity: "warning",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}#section-referral-documents`,
        dedupeKey: `lead_referral_document_upload_failed:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyLeadReferralDocumentRejected(input: {
  leadId: string;
  facilityId: string | null;
  documentName: string;
  reviewedByUserId: string;
}): Promise<void> {
  await createFacilityNotification({
    userId: input.reviewedByUserId,
    notificationType: "lead_referral_document_rejected",
    title: "Referral document rejected",
    message: `${input.documentName} was marked rejected.`,
    severity: "info",
    facilityId: input.facilityId,
    leadId: input.leadId,
    actionUrl: `/admin/crm/leads/${input.leadId}#section-referral-documents`,
    dedupeKey: `lead_referral_document_rejected:${input.leadId}:${Date.now()}`,
  });
}

export async function notifyLeadDocumentAiReviewReady(input: {
  leadId: string;
  facilityId: string | null;
  documentCount: number;
  intakeOwnerUserId: string | null;
}): Promise<void> {
  const msg = `AI document review is ready for a referral with ${input.documentCount} document${input.documentCount === 1 ? "" : "s"}.`;
  const targets = new Set<string>();
  if (input.intakeOwnerUserId && UUID_RE.test(input.intakeOwnerUserId)) targets.add(input.intakeOwnerUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_document_ai_review_ready",
        title: "AI document review ready",
        message: msg,
        severity: "info",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}#section-referral-documents`,
        dedupeKey: `lead_document_ai_review_ready:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyLeadDocumentAiReviewFailed(input: {
  leadId: string;
  facilityId: string | null;
  intakeOwnerUserId: string | null;
}): Promise<void> {
  const msg = "AI document review failed for a referral. Review documents manually.";
  const targets = new Set<string>();
  if (input.intakeOwnerUserId && UUID_RE.test(input.intakeOwnerUserId)) targets.add(input.intakeOwnerUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_document_ai_review_failed",
        title: "AI document review failed",
        message: msg,
        severity: "warning",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}#section-referral-documents`,
        dedupeKey: `lead_document_ai_review_failed:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyLeadIntakeReady(input: {
  leadId: string;
  facilityId: string | null;
}): Promise<void> {
  const msg = "A referral is ready for intake acceptance review.";
  for (const mgrId of await listManagerUserIds()) {
    await createFacilityNotification({
      userId: mgrId,
      notificationType: "lead_intake_ready",
      title: "Referral ready for intake",
      message: msg,
      severity: "info",
      facilityId: input.facilityId,
      leadId: input.leadId,
      actionUrl: `/admin/crm/leads/${input.leadId}#section-intake-readiness`,
      dedupeKey: `lead_intake_ready:${input.leadId}:${mgrId}`,
    });
  }
}

export async function notifyLeadIntakeNeedsInfo(input: {
  leadId: string;
  facilityId: string | null;
  salesRepUserId: string | null;
}): Promise<void> {
  const msg = "Missing referral information was requested. Follow up with the referral source.";
  const targets = new Set<string>();
  if (input.salesRepUserId && UUID_RE.test(input.salesRepUserId)) targets.add(input.salesRepUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_intake_needs_info",
        title: "Referral needs information",
        message: msg,
        severity: "warning",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}#section-intake-readiness`,
        dedupeKey: `lead_intake_needs_info:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyLeadIntakeClinicalReviewNeeded(input: {
  leadId: string;
  facilityId: string | null;
  assignToUserId: string | null;
}): Promise<void> {
  const msg = "A referral was assigned for clinical appropriateness review.";
  const targets = new Set<string>();
  if (input.assignToUserId && UUID_RE.test(input.assignToUserId)) targets.add(input.assignToUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_intake_clinical_review_needed",
        title: "Clinical review assigned",
        message: msg,
        severity: "warning",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}#section-intake-readiness`,
        dedupeKey: `lead_intake_clinical_review:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyLeadIntakeAccepted(input: {
  leadId: string;
  facilityId: string | null;
  salesRepUserId: string | null;
}): Promise<void> {
  const msg = "Referral was accepted by intake.";
  const targets = new Set<string>();
  if (input.salesRepUserId && UUID_RE.test(input.salesRepUserId)) targets.add(input.salesRepUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_intake_accepted",
        title: "Referral accepted",
        message: msg,
        severity: "success",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}`,
        dedupeKey: `lead_intake_accepted:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyLeadIntakeDeclined(input: {
  leadId: string;
  facilityId: string | null;
  salesRepUserId: string | null;
  declineReason: string;
}): Promise<void> {
  const safeReason = input.declineReason.slice(0, 80);
  const msg = `Referral was declined (${safeReason}).`;
  const targets = new Set<string>();
  if (input.salesRepUserId && UUID_RE.test(input.salesRepUserId)) targets.add(input.salesRepUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_intake_declined",
        title: "Referral declined",
        message: msg,
        severity: "warning",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}#section-intake-readiness`,
        dedupeKey: `lead_intake_declined:${input.leadId}:${userId}`,
      })
    )
  );
}

type AdmissionNotifyBase = {
  handoffId: string;
  leadId: string;
  facilityId: string | null;
  intakeOwnerUserId: string | null;
  salesRepUserId: string | null;
};

function admissionNotifyTargets(input: AdmissionNotifyBase): Set<string> {
  const targets = new Set<string>();
  if (input.intakeOwnerUserId && UUID_RE.test(input.intakeOwnerUserId)) targets.add(input.intakeOwnerUserId);
  if (input.salesRepUserId && UUID_RE.test(input.salesRepUserId)) targets.add(input.salesRepUserId);
  return targets;
}

export async function notifyLeadAdmissionHandoffCreated(input: AdmissionNotifyBase): Promise<void> {
  const msg = "Admission handoff created — plan SOC and complete intake checklist.";
  const targets = admissionNotifyTargets(input);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_admission_handoff_created",
        title: "Admission handoff created",
        message: msg,
        severity: "info",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/intake/admissions/${input.handoffId}`,
        dedupeKey: `lead_admission_handoff_created:${input.handoffId}:${userId}`,
      })
    )
  );
}

export async function notifyLeadAdmissionReadyForSoc(input: AdmissionNotifyBase): Promise<void> {
  const msg = "Referral admission handoff is ready for SOC planning.";
  const targets = admissionNotifyTargets(input);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);
  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_admission_ready_for_soc",
        title: "Ready for SOC",
        message: msg,
        severity: "success",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/intake/admissions/${input.handoffId}`,
      })
    )
  );
}

export async function notifyLeadAdmissionMissingItems(input: {
  handoffId: string;
  leadId: string;
  facilityId: string | null;
  intakeOwnerUserId: string | null;
  missingCount: number;
}): Promise<void> {
  const msg = `Admission handoff has ${input.missingCount} missing item${input.missingCount === 1 ? "" : "s"}.`;
  const targets = new Set<string>();
  if (input.intakeOwnerUserId && UUID_RE.test(input.intakeOwnerUserId)) targets.add(input.intakeOwnerUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);
  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_admission_missing_items",
        title: "Admission handoff missing items",
        message: msg,
        severity: "warning",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/intake/admissions/${input.handoffId}`,
      })
    )
  );
}

export async function notifyLeadAdmissionSocScheduled(input: AdmissionNotifyBase): Promise<void> {
  const msg = "SOC has been scheduled for an accepted referral.";
  const targets = admissionNotifyTargets(input);
  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_admission_soc_scheduled",
        title: "SOC scheduled",
        message: msg,
        severity: "success",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/intake/admissions/${input.handoffId}`,
      })
    )
  );
}

export async function notifyLeadAdmissionAloraEntered(input: AdmissionNotifyBase): Promise<void> {
  const msg = "Referral marked entered in Alora.";
  const targets = admissionNotifyTargets(input);
  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_admission_alora_entered",
        title: "Alora entry recorded",
        message: msg,
        severity: "info",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/intake/admissions/${input.handoffId}`,
      })
    )
  );
}

export async function notifyLeadAdmissionAdmitted(input: AdmissionNotifyBase): Promise<void> {
  const msg = "Referral admission handoff marked admitted.";
  const targets = admissionNotifyTargets(input);
  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_admission_admitted",
        title: "Referral admitted",
        message: msg,
        severity: "success",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/intake/admissions/${input.handoffId}`,
      })
    )
  );
}

export async function notifyLeadAdmissionOnHold(input: AdmissionNotifyBase): Promise<void> {
  const msg = "Admission handoff placed on hold.";
  const targets = admissionNotifyTargets(input);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);
  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_admission_on_hold",
        title: "Admission on hold",
        message: msg,
        severity: "warning",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/intake/admissions/${input.handoffId}`,
      })
    )
  );
}

export async function notifyLeadIntakeMissingRequiredDocuments(input: {
  leadId: string;
  facilityId: string | null;
  missingCount: number;
  intakeOwnerUserId: string | null;
}): Promise<void> {
  const msg = `Referral may be missing ${input.missingCount} required document type${input.missingCount === 1 ? "" : "s"}. Review intake checklist.`;
  const targets = new Set<string>();
  if (input.intakeOwnerUserId && UUID_RE.test(input.intakeOwnerUserId)) targets.add(input.intakeOwnerUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "lead_intake_missing_required_documents",
        title: "Referral missing required documents",
        message: msg,
        severity: "warning",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}#section-referral-documents`,
        dedupeKey: `lead_intake_missing_required_documents:${input.leadId}:${userId}`,
      })
    )
  );
}

export async function notifyFacilityReferralConverted(input: {
  leadId: string;
  facilityId: string;
  facilityName: string;
  patientName: string;
  salesRepUserId: string | null;
}): Promise<void> {
  const msg = `${input.patientName} from ${input.facilityName} converted to patient.`;
  const targets = new Set<string>();
  if (input.salesRepUserId && UUID_RE.test(input.salesRepUserId)) targets.add(input.salesRepUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "facility_referral_converted",
        title: "Facility referral converted",
        message: msg,
        severity: "success",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/crm/leads/${input.leadId}`,
      })
    )
  );
}

export async function notifyFacilityReferralLost(input: {
  leadId: string;
  facilityId: string;
  facilityName: string;
  patientName: string;
  lostReason: string;
  salesRepUserId: string | null;
}): Promise<void> {
  const msg = `${input.patientName} from ${input.facilityName} was marked lost: ${input.lostReason}.`;
  const targets = new Set<string>();
  if (input.salesRepUserId && UUID_RE.test(input.salesRepUserId)) targets.add(input.salesRepUserId);
  for (const mgrId of await listManagerUserIds()) targets.add(mgrId);

  await Promise.all(
    [...targets].map((userId) =>
      createFacilityNotification({
        userId,
        notificationType: "facility_referral_lost",
        title: "Facility referral lost",
        message: msg,
        severity: "warning",
        facilityId: input.facilityId,
        leadId: input.leadId,
        actionUrl: `/admin/facilities/referrals?facility_id=${input.facilityId}`,
      })
    )
  );
}

async function syncFollowUpTaskAlerts(staff: StaffProfile): Promise<void> {
  const today = getCrmCalendarTodayIso();
  const canSeeAll = canAccessFacilityAdminTools(staff);

  let query = supabaseAdmin
    .from("facility_follow_up_tasks")
    .select("id, facility_id, assigned_to, title, due_at, status, snoozed_until")
    .in("status", ["open", "snoozed"])
    .limit(500);

  if (!canSeeAll) {
    query = query.eq("assigned_to", staff.user_id);
  }

  const { data: tasks } = await query;
  const facilityIds = [...new Set((tasks ?? []).map((t) => (t as { facility_id: string }).facility_id))];
  const facilityNames: Record<string, string> = {};
  if (facilityIds.length > 0) {
    const { data: facs } = await supabaseAdmin.from("facilities").select("id, name").in("id", facilityIds);
    for (const f of facs ?? []) facilityNames[(f as { id: string }).id] = String((f as { name?: string }).name ?? "Facility");
  }

  const managerIds = canSeeAll ? await listManagerUserIds() : [];

  for (const raw of tasks ?? []) {
    const task = raw as FollowUpTaskRow;
    const effStatus = effectiveTaskStatus(task);
    if (effStatus !== "open") continue;

    const effDue = effectiveTaskDueAt(task);
    const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(effDue));
    const facilityName = facilityNames[task.facility_id] ?? "Facility";
    const assignee = task.assigned_to;

    if (dueYmd === today && assignee && UUID_RE.test(assignee)) {
      await createFacilityNotification({
        userId: assignee,
        notificationType: "facility_follow_up_due",
        title: "Follow-up due today",
        message: `Follow up with ${facilityName}: ${task.title}`,
        severity: "info",
        facilityId: task.facility_id,
        taskId: task.id,
        actionUrl: `/admin/facilities/follow-ups?task=${task.id}`,
      });
    } else if (dueYmd < today && assignee && UUID_RE.test(assignee)) {
      const daysOver = daysBetweenYmd(dueYmd, today);
      const severity = overdueSeverity(daysOver);
      await createFacilityNotification({
        userId: assignee,
        notificationType: "facility_follow_up_overdue",
        title: "Overdue facility follow-up",
        message: `${facilityName}: ${task.title} (${daysOver} day${daysOver === 1 ? "" : "s"} overdue)`,
        severity,
        facilityId: task.facility_id,
        taskId: task.id,
        actionUrl: `/admin/facilities/follow-ups?task=${task.id}`,
        metadata: { days_overdue: daysOver },
      });

      if (canSeeAll && daysOver >= 2) {
        for (const mgrId of managerIds) {
          if (mgrId === assignee) continue;
          await createFacilityNotification({
            userId: mgrId,
            notificationType: "facility_follow_up_overdue",
            title: "Rep overdue follow-up",
            message: `${facilityName}: ${task.title} is ${daysOver} days overdue.`,
            severity,
            facilityId: task.facility_id,
            taskId: task.id,
            actionUrl: `/admin/facilities/follow-ups?task=${task.id}`,
            metadata: { days_overdue: daysOver, assigned_to: assignee },
          });
        }
      }
    }
  }
}

async function syncReferralPipelineAlerts(staff: StaffProfile): Promise<void> {
  let query = supabaseAdmin
    .from("leads")
    .select(
      "id, status, contact_id, referring_facility_id, assigned_to_staff_id, produced_by_user_id, referral_received_at, referral_attribution_json"
    )
    .is("deleted_at", null)
    .or("source.eq.facility_outreach,referral_source_type.eq.facility_outreach,referring_facility_id.not.is.null")
    .limit(500);

  const scopedRep = isSalesAgentRole(staff) && !canAccessFacilityAdminTools(staff);
  if (scopedRep) query = query.eq("produced_by_user_id", staff.user_id);

  const { data: leads } = await query;
  const facilityIds = [
    ...new Set(
      (leads ?? [])
        .map((l) => (l as { referring_facility_id?: string | null }).referring_facility_id)
        .filter((id): id is string => typeof id === "string")
    ),
  ];
  const facilityNames: Record<string, string> = {};
  if (facilityIds.length > 0) {
    const { data: facs } = await supabaseAdmin.from("facilities").select("id, name").in("id", facilityIds);
    for (const f of facs ?? []) facilityNames[(f as { id: string }).id] = String((f as { name?: string }).name ?? "Facility");
  }

  const managerIds = canAccessFacilityAdminTools(staff) ? await listManagerUserIds() : [];

  const contactIds = [
    ...new Set(
      (leads ?? [])
        .map((l) => (l as { contact_id?: string | null }).contact_id)
        .filter((id): id is string => typeof id === "string")
    ),
  ];
  const contactNames: Record<string, string> = {};
  if (contactIds.length > 0) {
    const { data: contacts } = await supabaseAdmin.from("contacts").select("id, full_name").in("id", contactIds);
    for (const c of contacts ?? []) {
      contactNames[(c as { id: string }).id] = String((c as { full_name?: string }).full_name ?? "Patient");
    }
  }

  for (const raw of leads ?? []) {
    const lead = raw as Record<string, unknown>;
    if (!isFacilitySourcedLead(lead as Parameters<typeof isFacilitySourcedLead>[0])) continue;

    const leadId = String(lead.id);
    const status = typeof lead.status === "string" ? lead.status : "";
    const stage = pipelineStageForLeadStatus(status);
    if (stage.key === "converted" || stage.key === "lost") continue;

    const facilityId =
      typeof lead.referring_facility_id === "string" ? lead.referring_facility_id : null;
    const facilityName = facilityId ? (facilityNames[facilityId] ?? "Facility") : "Facility";
    const ageDays = referralAgeDays(
      typeof lead.referral_received_at === "string" ? lead.referral_received_at : null
    );
    const intakeOwner =
      typeof lead.assigned_to_staff_id === "string" ? lead.assigned_to_staff_id : null;
    const salesRep =
      typeof lead.produced_by_user_id === "string" ? lead.produced_by_user_id : null;

    const contactId = typeof lead.contact_id === "string" ? lead.contact_id : null;
    const patientName = contactId ? (contactNames[contactId] ?? "Patient") : "Patient";

    if (ageDays >= 3) {
      const targets = new Set<string>();
      if (intakeOwner && UUID_RE.test(intakeOwner)) targets.add(intakeOwner);
      if (salesRep && UUID_RE.test(salesRep)) targets.add(salesRep);
      for (const mgrId of managerIds) targets.add(mgrId);

      await Promise.all(
        [...targets].map((userId) =>
          createFacilityNotification({
            userId,
            notificationType: "facility_referral_stuck",
            title: "Referral stuck in pipeline",
            message: `${patientName} from ${facilityName} has been in ${stage.label} for ${ageDays} days.`,
            severity: ageDays >= 5 ? "urgent" : "warning",
            facilityId,
            leadId,
            actionUrl: `/admin/facilities/referrals?facility_id=${facilityId ?? ""}`,
            metadata: { pipeline_stage: stage.key, age_days: ageDays },
          })
        )
      );
    }

    if (stage.key === "waiting_orders" && ageDays >= 3) {
      const targets = new Set<string>();
      if (intakeOwner && UUID_RE.test(intakeOwner)) targets.add(intakeOwner);
      if (salesRep && UUID_RE.test(salesRep)) targets.add(salesRep);
      for (const mgrId of managerIds) targets.add(mgrId);

      await Promise.all(
        [...targets].map((userId) =>
          createFacilityNotification({
            userId,
            notificationType: "facility_referral_waiting_orders",
            title: "Referral waiting on orders/F2F",
            message: `${facilityName} referral is still waiting on orders/F2F (${ageDays} days).`,
            severity: "warning",
            facilityId,
            leadId,
            actionUrl: `/admin/facilities/referrals?facility_id=${facilityId ?? ""}`,
            metadata: { age_days: ageDays },
          })
        )
      );
    }
  }
}

async function syncWarmSourceAlerts(staff: StaffProfile): Promise<void> {
  const warmStart = new Date();
  warmStart.setDate(warmStart.getDate() - 30);

  let facQuery = supabaseAdmin
    .from("facilities")
    .select("id, name, assigned_rep_user_id")
    .eq("is_active", true)
    .limit(300);

  if (isSalesAgentRole(staff) && !canAccessFacilityAdminTools(staff)) {
    facQuery = facQuery.eq("assigned_rep_user_id", staff.user_id);
  }

  const { data: facilities } = await facQuery;
  if (!facilities?.length) return;

  const facilityIds = facilities.map((f) => (f as { id: string }).id);
  const { data: activities } = await supabaseAdmin
    .from("facility_activities")
    .select("facility_id, activity_type, outcome, referral_potential, decision_maker_met, activity_at")
    .in("facility_id", facilityIds)
    .gte("activity_at", warmStart.toISOString())
    .order("activity_at", { ascending: false });

  const warmFacilityIds = new Set<string>();
  for (const a of activities ?? []) {
    if (isWarmActivityRow(a as Parameters<typeof isWarmActivityRow>[0])) {
      warmFacilityIds.add(String((a as { facility_id: string }).facility_id));
    }
  }
  if (warmFacilityIds.size === 0) return;

  const { data: openTasks } = await supabaseAdmin
    .from("facility_follow_up_tasks")
    .select("facility_id")
    .in("facility_id", [...warmFacilityIds])
    .in("status", ["open", "snoozed"]);

  const withOpenTask = new Set((openTasks ?? []).map((t) => String((t as { facility_id: string }).facility_id)));

  for (const f of facilities) {
    const fid = (f as { id: string }).id;
    if (!warmFacilityIds.has(fid) || withOpenTask.has(fid)) continue;

    const repId = (f as { assigned_rep_user_id?: string | null }).assigned_rep_user_id;
    const targetUser =
      repId && UUID_RE.test(repId)
        ? repId
        : isSalesAgentRole(staff) && !canAccessFacilityAdminTools(staff)
          ? staff.user_id
          : null;

    if (!targetUser || !UUID_RE.test(targetUser)) continue;
    if (isSalesAgentRole(staff) && !canAccessFacilityAdminTools(staff) && targetUser !== staff.user_id) continue;

    await createFacilityNotification({
      userId: targetUser,
      notificationType: "facility_warm_source_needs_follow_up",
      title: "Warm referral source needs follow-up",
      message: `${String((f as { name?: string }).name ?? "Facility")} had a warm interaction but no follow-up task.`,
      severity: "warning",
      facilityId: fid,
      actionUrl: `/admin/facilities/${fid}`,
    });
  }
}

async function syncReferralProfileAlerts(staff: StaffProfile): Promise<void> {
  const { data: profiles } = await supabaseAdmin
    .from("facility_referral_profiles")
    .select("facility_id, referral_potential, referral_process, next_best_action, next_best_action_due_at")
    .in("referral_potential", ["Warm", "Hot", "Active Producer"])
    .limit(100);

  const facilityIds = (profiles ?? []).map((p) => (p as { facility_id: string }).facility_id);
  const { data: facilities } = facilityIds.length
    ? await supabaseAdmin.from("facilities").select("id, name, assigned_rep_user_id").in("id", facilityIds)
    : { data: [] };
  const facById = new Map(
    (facilities ?? []).map((f) => [(f as { id: string }).id, f as { id: string; name: string; assigned_rep_user_id: string | null }])
  );

  for (const raw of profiles ?? []) {
    const p = raw as {
      facility_id: string;
      referral_potential: string | null;
      referral_process: string | null;
      next_best_action: string | null;
      next_best_action_due_at: string | null;
    };

    const fac = facById.get(p.facility_id);
    if (!fac) continue;

    const repId = fac.assigned_rep_user_id ?? staff.user_id;
    if (repId !== staff.user_id && !isManagerOrHigher(staff)) continue;

    const facName = fac.name;

    if (!p.referral_process?.trim()) {
      queueFacilityNotification(() =>
        createFacilityNotification({
          userId: staff.user_id,
          facilityId: p.facility_id,
          notificationType: "facility_referral_process_missing",
          title: "Referral process missing",
          message: `${facName} is ${p.referral_potential} but referral process is not documented.`,
          severity: "warning",
          actionUrl: `/admin/facilities/${p.facility_id}`,
          dedupeKey: `facility_referral_process_missing:${p.facility_id}`,
        })
      );
    }

    if (p.next_best_action_due_at && new Date(p.next_best_action_due_at).getTime() <= Date.now()) {
      queueFacilityNotification(() =>
        createFacilityNotification({
          userId: staff.user_id,
          facilityId: p.facility_id,
          notificationType: "facility_next_best_action_due",
          title: "Next best action due",
          message: p.next_best_action ?? `Follow up at ${facName}`,
          severity: "warning",
          actionUrl: `/admin/facilities/${p.facility_id}`,
          dedupeKey: `facility_next_best_action_due:${p.facility_id}:${p.next_best_action_due_at.slice(0, 10)}`,
        })
      );
    } else if (!p.referral_process?.trim() && p.referral_potential) {
      queueFacilityNotification(() =>
        createFacilityNotification({
          userId: staff.user_id,
          facilityId: p.facility_id,
          notificationType: "facility_profile_needs_update",
          title: "Profile needs update",
          message: `Update referral source profile for ${facName}.`,
          severity: "info",
          actionUrl: `/admin/facilities/${p.facility_id}`,
          dedupeKey: `facility_profile_needs_update:${p.facility_id}`,
        })
      );
    }
  }
}

export async function generateFacilityDailyAlerts(staff: StaffProfile): Promise<FacilityDailyAlertSummary> {
  if (!canAccessFacilityFieldTools(staff)) {
    return {
      followUpsDueToday: 0,
      followUpsOverdue: 0,
      referralsWaitingOrders: 0,
      referralsStuck: 0,
      warmSourcesNeedFollowUp: 0,
      newReferrals: 0,
      routeUnfinishedCount: 0,
    };
  }

  try {
    await syncFollowUpTaskAlerts(staff);
    await syncReferralPipelineAlerts(staff);
    await syncWarmSourceAlerts(staff);
    await syncReferralProfileAlerts(staff);
    const { syncPacketRequestAlerts } = await import("@/lib/crm/facility-packet-requests");
    await syncPacketRequestAlerts(staff);
    const { syncRoutePlanAlerts } = await import("@/lib/crm/facility-route-plans");
    await syncRoutePlanAlerts(staff);
    const { syncCampaignStepNotifications } = await import("@/lib/crm/facility-campaigns");
    await syncCampaignStepNotifications(staff);
  } catch (e) {
    console.warn("[facility-notifications] daily alerts:", e);
  }

  const { notifications } = await listFacilityNotifications(staff, { status: "unread", limit: 200 });

  let followUpsDueToday = 0;
  let followUpsOverdue = 0;
  let referralsWaitingOrders = 0;
  let referralsStuck = 0;
  let warmSourcesNeedFollowUp = 0;
  let newReferrals = 0;
  let routeUnfinishedCount = 0;

  for (const n of notifications) {
    if (n.notification_type === "facility_follow_up_due") followUpsDueToday++;
    if (n.notification_type === "facility_follow_up_overdue") followUpsOverdue++;
    if (n.notification_type === "facility_referral_waiting_orders") referralsWaitingOrders++;
    if (n.notification_type === "facility_referral_stuck") referralsStuck++;
    if (n.notification_type === "facility_warm_source_needs_follow_up") warmSourcesNeedFollowUp++;
    if (n.notification_type === "facility_referral_created") newReferrals++;
    if (n.notification_type === "facility_route_unfinished") routeUnfinishedCount++;
  }

  return {
    followUpsDueToday,
    followUpsOverdue,
    referralsWaitingOrders,
    referralsStuck,
    warmSourcesNeedFollowUp,
    newReferrals,
    routeUnfinishedCount,
  };
}

export async function generateManagerFacilityAlerts(staff: StaffProfile): Promise<FacilityManagerAlertRow[]> {
  if (!canAccessFacilityAdminTools(staff)) return [];

  const alerts: FacilityManagerAlertRow[] = [];
  const today = getCrmCalendarTodayIso();

  const { data: staffRows } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email, role")
    .eq("is_active", true);

  const staffLabel = (uid: string): string => {
    const s = (staffRows ?? []).find((r) => (r as { user_id: string }).user_id === uid) as
      | { full_name?: string | null; email?: string | null }
      | undefined;
    return (s?.full_name ?? "").trim() || (s?.email ?? "").trim() || "Rep";
  };

  const { data: taskRows } = await supabaseAdmin
    .from("facility_follow_up_tasks")
    .select("id, assigned_to, due_at, status, snoozed_until")
    .in("status", ["open", "snoozed"])
    .limit(2000);

  const overdueByRep: Record<string, number> = {};
  for (const raw of taskRows ?? []) {
    const t = raw as FollowUpTaskRow;
    if (effectiveTaskStatus(t) !== "open") continue;
    const dueYmd = getCrmCalendarDateIsoFromInstant(new Date(effectiveTaskDueAt(t)));
    if (dueYmd >= today) continue;
    const rep = t.assigned_to;
    if (!rep) continue;
    overdueByRep[rep] = (overdueByRep[rep] ?? 0) + 1;
  }

  for (const [repId, count] of Object.entries(overdueByRep)) {
    if (count < 1) continue;
    alerts.push({
      key: `overdue_rep_${repId}`,
      title: `${staffLabel(repId)} has ${count} overdue follow-up${count === 1 ? "" : "s"}`,
      message: "Review follow-up tasks and reassign if needed.",
      severity: count >= 5 ? "urgent" : "warning",
      action_url: `/admin/facilities/follow-ups?assigned_to=${repId}`,
      count,
    });
  }

  const { data: leads } = await supabaseAdmin
    .from("leads")
    .select("id, status, referral_received_at, referring_facility_id")
    .is("deleted_at", null)
    .or("source.eq.facility_outreach,referral_source_type.eq.facility_outreach,referring_facility_id.not.is.null")
    .limit(500);

  let waitingOrders = 0;
  let stuck = 0;
  for (const raw of leads ?? []) {
    const l = raw as { status?: string; referral_received_at?: string | null };
    const stage = pipelineStageForLeadStatus(l.status ?? "");
    const age = referralAgeDays(l.referral_received_at ?? null);
    if (stage.key === "converted" || stage.key === "lost") continue;
    if (age >= 3) stuck++;
    if (stage.key === "waiting_orders" && age >= 3) waitingOrders++;
  }

  if (waitingOrders > 0) {
    alerts.push({
      key: "waiting_orders",
      title: `${waitingOrders} referral${waitingOrders === 1 ? "" : "s"} waiting on orders/F2F 3+ days`,
      message: "Intake may need to chase orders or F2F documentation.",
      severity: "warning",
      action_url: "/admin/facilities/referrals?status=waiting_orders",
      count: waitingOrders,
    });
  }

  if (stuck > 0) {
    alerts.push({
      key: "stuck_referrals",
      title: `${stuck} referral${stuck === 1 ? "" : "s"} stuck 3+ days`,
      message: "Review intake pipeline for bottlenecks.",
      severity: stuck >= 5 ? "urgent" : "warning",
      action_url: "/admin/facilities/referrals",
      count: stuck,
    });
  }

  const inactiveCutoff = new Date();
  inactiveCutoff.setDate(inactiveCutoff.getDate() - 3);
  const salesReps = (staffRows ?? []).filter((r) =>
    isSalesAgentRole({ role: (r as { role: string }).role } as StaffProfile)
  );

  for (const rep of salesReps) {
    const repId = (rep as { user_id: string }).user_id;
    const { count } = await supabaseAdmin
      .from("facility_activities")
      .select("id", { count: "exact", head: true })
      .eq("staff_user_id", repId)
      .gte("activity_at", inactiveCutoff.toISOString());

    if ((count ?? 0) === 0) {
      const label = staffLabel(repId);
      const days = 3;
      alerts.push({
        key: `inactive_rep_${repId}`,
        title: `${label} has not logged outreach in ${days}+ days`,
        message: "Check in on territory coverage and follow-ups.",
        severity: "warning",
        action_url: "/admin/facilities/analytics",
        count: days,
      });

      await createFacilityNotification({
        userId: staff.user_id,
        notificationType: "facility_rep_inactive",
        title: "Rep inactive on outreach",
        message: `${label} has not logged outreach in ${days}+ days.`,
        severity: "warning",
        actionUrl: "/admin/facilities/analytics",
        metadata: { rep_user_id: repId },
        dedupeKey: buildFacilityNotificationDedupeKey("facility_rep_inactive", { facilityId: repId }),
      });
    }
  }

  const warmStart = new Date();
  warmStart.setDate(warmStart.getDate() - 30);
  const { data: warmActs } = await supabaseAdmin
    .from("facility_activities")
    .select("facility_id, activity_type, outcome, referral_potential, decision_maker_met")
    .gte("activity_at", warmStart.toISOString())
    .limit(3000);

  const warmIds = new Set<string>();
  for (const a of warmActs ?? []) {
    if (isWarmActivityRow(a as Parameters<typeof isWarmActivityRow>[0])) {
      warmIds.add(String((a as { facility_id: string }).facility_id));
    }
  }

  if (warmIds.size > 0) {
    const { data: openTasks } = await supabaseAdmin
      .from("facility_follow_up_tasks")
      .select("facility_id")
      .in("facility_id", [...warmIds])
      .in("status", ["open", "snoozed"]);

    const withTask = new Set((openTasks ?? []).map((t) => String((t as { facility_id: string }).facility_id)));
    const warmNoTask = [...warmIds].filter((id) => !withTask.has(id)).length;

    if (warmNoTask > 0) {
      alerts.push({
        key: "warm_no_task",
        title: `${warmNoTask} warm source${warmNoTask === 1 ? "" : "s"} have no follow-up task`,
        message: "Assign follow-ups to keep momentum with hot facilities.",
        severity: "warning",
        action_url: "/admin/facilities/analytics",
        count: warmNoTask,
      });
    }
  }

  return alerts.sort((a, b) => {
    const rank = { urgent: 0, warning: 1, info: 2, success: 3 };
    return rank[a.severity] - rank[b.severity];
  });
}

export async function runFacilityAlertGenerationForUser(staff: StaffProfile): Promise<{
  daily: FacilityDailyAlertSummary;
  managerAlerts: FacilityManagerAlertRow[];
}> {
  const daily = await generateFacilityDailyAlerts(staff);
  const managerAlerts = canAccessFacilityAdminTools(staff)
    ? await generateManagerFacilityAlerts(staff)
    : [];
  return { daily, managerAlerts };
}
