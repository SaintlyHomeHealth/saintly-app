import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import {
  addCalendarDaysToIsoDate,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import { saveFacilityActivityRecord } from "@/lib/crm/facility-activity-save";
import {
  defaultPacketEmailMessage,
  defaultPacketEmailSubject,
  defaultPacketFaxCoverSheet,
  isFacilityPacketEmailConfigured,
  isFacilityPacketFaxConfigured,
} from "@/lib/crm/facility-packet-email-from";
import { sendFacilityPacketEmail } from "@/lib/crm/facility-packet-email-send";
import { sendFacilityPacketFax } from "@/lib/crm/facility-packet-fax-send";
import { downloadPacketMaterialBytes, loadPacketMaterialsByIds } from "@/lib/crm/facility-packet-materials";
import type {
  PacketDeliveryAttemptRow,
  PacketDeliveryMethod,
  PacketMaterialRow,
  PacketRequestRow,
} from "@/lib/crm/facility-packet-types";
import {
  createFacilityNotification,
  notifyFollowUpTaskAssigned,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import type { StaffProfile } from "@/lib/staff-profile";
import {
  canAccessFacilityAdminTools,
  canMutatePacketRequest,
  loadPacketRequestForStaff,
} from "@/lib/crm/facility-packet-delivery-access";

export type SendPacketRequestInput = {
  delivery_method: "email" | "fax" | "manual";
  recipient_email?: string | null;
  recipient_fax?: string | null;
  recipient_name?: string | null;
  subject?: string | null;
  message?: string | null;
  cover_sheet?: string | null;
  material_ids?: string[];
  create_follow_up?: boolean;
  follow_up_due_at?: string | null;
  sent_notes?: string | null;
};

export type SendPacketRequestResult =
  | {
      ok: true;
      packet_request: PacketRequestRow;
      delivery_attempt: PacketDeliveryAttemptRow;
      activity_id?: string;
      follow_up_task_id?: string | null;
    }
  | {
      ok: false;
      code: string;
      message: string;
      delivery_attempt?: PacketDeliveryAttemptRow;
    };

function mapAttempt(raw: Record<string, unknown>): PacketDeliveryAttemptRow {
  return {
    id: String(raw.id),
    packet_request_id: String(raw.packet_request_id),
    facility_id: String(raw.facility_id),
    contact_id: typeof raw.contact_id === "string" ? raw.contact_id : null,
    delivery_method: raw.delivery_method as PacketDeliveryAttemptRow["delivery_method"],
    status: raw.status as PacketDeliveryAttemptRow["status"],
    recipient_name: typeof raw.recipient_name === "string" ? raw.recipient_name : null,
    recipient_email: typeof raw.recipient_email === "string" ? raw.recipient_email : null,
    recipient_fax: typeof raw.recipient_fax === "string" ? raw.recipient_fax : null,
    subject: typeof raw.subject === "string" ? raw.subject : null,
    message: typeof raw.message === "string" ? raw.message : null,
    cover_sheet: typeof raw.cover_sheet === "string" ? raw.cover_sheet : null,
    material_ids: Array.isArray(raw.material_ids) ? (raw.material_ids as string[]) : null,
    attachment_paths: Array.isArray(raw.attachment_paths) ? (raw.attachment_paths as string[]) : null,
    provider: typeof raw.provider === "string" ? raw.provider : null,
    provider_message_id: typeof raw.provider_message_id === "string" ? raw.provider_message_id : null,
    provider_status: typeof raw.provider_status === "string" ? raw.provider_status : null,
    error_message: typeof raw.error_message === "string" ? raw.error_message : null,
    sent_at: typeof raw.sent_at === "string" ? raw.sent_at : null,
    created_by: typeof raw.created_by === "string" ? raw.created_by : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

function mapRequestRow(raw: Record<string, unknown>): PacketRequestRow {
  return {
    id: String(raw.id),
    facility_id: String(raw.facility_id),
    contact_id: typeof raw.contact_id === "string" ? raw.contact_id : null,
    activity_id: typeof raw.activity_id === "string" ? raw.activity_id : null,
    lead_id: typeof raw.lead_id === "string" ? raw.lead_id : null,
    campaign_id: typeof raw.campaign_id === "string" ? raw.campaign_id : null,
    campaign_step_instance_id:
      typeof raw.campaign_step_instance_id === "string" ? raw.campaign_step_instance_id : null,
    requested_by_user_id: typeof raw.requested_by_user_id === "string" ? raw.requested_by_user_id : null,
    assigned_to: typeof raw.assigned_to === "string" ? raw.assigned_to : null,
    delivery_method: (raw.delivery_method as PacketDeliveryMethod | null) ?? null,
    status: (raw.status as PacketRequestRow["status"]) ?? "pending",
    priority: (raw.priority as PacketRequestRow["priority"]) ?? "Normal",
    requested_at: typeof raw.requested_at === "string" ? raw.requested_at : new Date().toISOString(),
    due_at: typeof raw.due_at === "string" ? raw.due_at : null,
    sent_at: typeof raw.sent_at === "string" ? raw.sent_at : null,
    sent_by: typeof raw.sent_by === "string" ? raw.sent_by : null,
    confirmed_received_at: typeof raw.confirmed_received_at === "string" ? raw.confirmed_received_at : null,
    confirmed_by: typeof raw.confirmed_by === "string" ? raw.confirmed_by : null,
    recipient_name: typeof raw.recipient_name === "string" ? raw.recipient_name : null,
    recipient_role: typeof raw.recipient_role === "string" ? raw.recipient_role : null,
    recipient_email: typeof raw.recipient_email === "string" ? raw.recipient_email : null,
    recipient_fax: typeof raw.recipient_fax === "string" ? raw.recipient_fax : null,
    recipient_phone: typeof raw.recipient_phone === "string" ? raw.recipient_phone : null,
    packet_type: (raw.packet_type as PacketRequestRow["packet_type"]) ?? null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    sent_notes: typeof raw.sent_notes === "string" ? raw.sent_notes : null,
    follow_up_task_id: typeof raw.follow_up_task_id === "string" ? raw.follow_up_task_id : null,
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : null,
    last_delivery_attempt_id: typeof raw.last_delivery_attempt_id === "string" ? raw.last_delivery_attempt_id : null,
    delivery_attempt_count: typeof raw.delivery_attempt_count === "number" ? raw.delivery_attempt_count : 0,
    delivery_error: typeof raw.delivery_error === "string" ? raw.delivery_error : null,
    last_delivery_status: typeof raw.last_delivery_status === "string" ? raw.last_delivery_status : null,
    material_ids: Array.isArray(raw.material_ids) ? (raw.material_ids as string[]) : null,
    created_at: typeof raw.created_at === "string" ? raw.created_at : new Date().toISOString(),
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : new Date().toISOString(),
  };
}

async function buildEmailAttachments(materials: PacketMaterialRow[]) {
  const attachments: Array<{ filename: string; content: string }> = [];
  const externalLinks: Array<{ label: string; url: string }> = [];
  const paths: string[] = [];

  for (const material of materials) {
    if (material.storage_path) {
      const downloaded = await downloadPacketMaterialBytes(material.storage_path);
      if (!downloaded) throw new Error(`Material file missing: ${material.name}`);
      paths.push(material.storage_path);
      attachments.push({
        filename: material.file_name ?? downloaded.fileName,
        content: Buffer.from(downloaded.bytes).toString("base64"),
      });
    } else if (material.external_url) {
      externalLinks.push({ label: material.name, url: material.external_url });
    }
  }

  return { attachments, externalLinks, paths };
}

export async function listPacketDeliveryAttempts(
  staff: StaffProfile,
  packetRequestId: string
): Promise<PacketDeliveryAttemptRow[]> {
  const loaded = await loadPacketRequestForStaff(staff, packetRequestId);
  if (!loaded) return [];
  const { data } = await supabaseAdmin
    .from("facility_packet_delivery_attempts")
    .select("*")
    .eq("packet_request_id", packetRequestId)
    .order("created_at", { ascending: false });
  return (data ?? []).map((r) => mapAttempt(r as Record<string, unknown>));
}

export async function sendPacketRequest(
  staff: StaffProfile,
  packetRequestId: string,
  input: SendPacketRequestInput
): Promise<SendPacketRequestResult> {
  const loaded = await loadPacketRequestForStaff(staff, packetRequestId);
  if (!loaded) return { ok: false, code: "NOT_FOUND", message: "Packet request not found." };
  const { row, facilityRepId } = loaded;
  if (!canMutatePacketRequest(staff, row, facilityRepId)) {
    return { ok: false, code: "FORBIDDEN", message: "You cannot send this packet request." };
  }
  if (row.status !== "pending" && row.status !== "failed") {
    return { ok: false, code: "INVALID_STATUS", message: "Packet request is not pending." };
  }

  const method = input.delivery_method;
  const recipientName = (input.recipient_name ?? row.recipient_name ?? "").trim() || null;
  const recipientEmail = (input.recipient_email ?? row.recipient_email ?? "").trim() || null;
  const recipientFax = (input.recipient_fax ?? row.recipient_fax ?? "").trim() || null;
  const materialIds = [...new Set(input.material_ids ?? row.material_ids ?? [])];

  if (method === "email" && !recipientEmail) {
    return { ok: false, code: "MISSING_RECIPIENT", message: "Recipient email is required." };
  }
  if (method === "fax" && !recipientFax) {
    return { ok: false, code: "MISSING_RECIPIENT", message: "Recipient fax is required." };
  }
  if (method === "email" && !isFacilityPacketEmailConfigured()) {
    return {
      ok: false,
      code: "EMAIL_NOT_CONFIGURED",
      message: "Email sending is not configured. Use Mark Sent instead.",
    };
  }
  if (method === "fax" && !isFacilityPacketFaxConfigured()) {
    return {
      ok: false,
      code: "FAX_NOT_CONFIGURED",
      message: "Fax sending is not configured. Use Mark Sent instead.",
    };
  }

  let materials: PacketMaterialRow[] = [];
  if (materialIds.length) {
    materials = await loadPacketMaterialsByIds(materialIds);
    const active = materials.filter((m) => m.is_active);
    if (active.length !== materialIds.length) {
      return { ok: false, code: "MATERIAL_NOT_FOUND", message: "One or more materials are unavailable." };
    }
    materials = active;
  }

  const subject = (input.subject ?? defaultPacketEmailSubject()).trim();
  const message =
    (input.message ?? defaultPacketEmailMessage(recipientName)).trim() ||
    defaultPacketEmailMessage(recipientName);
  const coverSheet =
    (input.cover_sheet ??
      defaultPacketFaxCoverSheet({
        recipientName,
        recipientOrganization: null,
        coverNote: null,
      })).trim() || defaultPacketFaxCoverSheet({ recipientName });

  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("id, name")
    .eq("id", row.facility_id)
    .maybeSingle();
  const facilityName = String((facility as { name?: string } | null)?.name ?? "Facility");

  const { data: attemptRow, error: attemptErr } = await supabaseAdmin
    .from("facility_packet_delivery_attempts")
    .insert({
      packet_request_id: packetRequestId,
      facility_id: row.facility_id,
      contact_id: row.contact_id,
      delivery_method: method,
      status: "pending",
      recipient_name: recipientName,
      recipient_email: method === "email" ? recipientEmail : null,
      recipient_fax: method === "fax" ? recipientFax : null,
      subject: method === "email" ? subject : "Saintly Home Health Referral Packet",
      message: method === "email" ? message : null,
      cover_sheet: method === "fax" ? coverSheet : null,
      material_ids: materialIds.length ? materialIds : null,
      created_by: staff.user_id,
    })
    .select("*")
    .single();

  if (attemptErr || !attemptRow) {
    return { ok: false, code: "ATTEMPT_FAILED", message: "Could not create delivery attempt." };
  }

  const attempt = mapAttempt(attemptRow as Record<string, unknown>);
  const attemptCount = (row.delivery_attempt_count ?? 0) + 1;

  await supabaseAdmin
    .from("facility_packet_requests")
    .update({
      delivery_attempt_count: attemptCount,
      last_delivery_attempt_id: attempt.id,
      last_delivery_status: "pending",
      delivery_error: null,
      material_ids: materialIds.length ? materialIds : row.material_ids,
    })
    .eq("id", packetRequestId);

  if (method === "manual") {
    const sentAt = new Date().toISOString();
    await supabaseAdmin
      .from("facility_packet_delivery_attempts")
      .update({ status: "sent", sent_at: sentAt, provider: "manual" })
      .eq("id", attempt.id);
    const updatedAttempt = { ...attempt, status: "sent" as const, sent_at: sentAt, provider: "manual" };
    return completeSuccessfulSend({
      staff,
      row,
      packetRequestId,
      attempt: updatedAttempt,
      attemptCount,
      facilityName,
      method: "manual",
      mappedDeliveryMethod: row.delivery_method ?? "other",
      materialLabels: materials.map((m) => m.name).join(", "),
      recipientLabel: recipientName ?? facilityName,
      recipientEmail,
      recipientFax,
      sentNotes: (input.sent_notes ?? "").trim(),
      createFollowUp: input.create_follow_up !== false,
      followUpDueAt: input.follow_up_due_at,
    });
  }

  const materialNames = materials.map((m) => m.name).join(", ") || "None selected";
  let attachmentPaths: string[] | null = null;
  let provider: string | null = null;
  let providerMessageId: string | null = null;
  let providerStatus: string | null = null;

  try {
    if (method === "email") {
      const { attachments, externalLinks, paths } = await buildEmailAttachments(materials);
      attachmentPaths = paths.length ? paths : null;
      if (!attachments.length && !externalLinks.length && materialIds.length) {
        throw new Error("Selected materials have no files or links to send.");
      }
      const emailResult = await sendFacilityPacketEmail({
        to: recipientEmail!,
        subject,
        message,
        attachments: attachments.length ? attachments : undefined,
        externalLinks: externalLinks.length ? externalLinks : undefined,
      });
      if (!emailResult.ok) {
        await failAttempt(attempt.id, packetRequestId, emailResult.code, emailResult.message, attemptCount);
        return {
          ok: false,
          code: emailResult.code,
          message: emailResult.message,
          delivery_attempt: await reloadAttempt(attempt.id),
        };
      }
      provider = "resend";
      providerMessageId = emailResult.providerMessageId;
      providerStatus = "sent";
    } else {
      const faxMaterials = materials.filter((m) => m.storage_path);
      if (!faxMaterials.length) {
        throw new Error("Select at least one material with an uploaded PDF/file for fax.");
      }
      const faxResult = await sendFacilityPacketFax({
        toFax: recipientFax!,
        recipientName,
        recipientOrganization: facilityName,
        subject,
        coverSheetText: coverSheet,
        facilityId: row.facility_id,
        staffUserId: staff.user_id,
        materials: faxMaterials,
      });
      if (!faxResult.ok) {
        await failAttempt(attempt.id, packetRequestId, faxResult.code, faxResult.message, attemptCount);
        return {
          ok: false,
          code: faxResult.code,
          message: faxResult.message,
          delivery_attempt: await reloadAttempt(attempt.id),
        };
      }
      provider = "telnyx";
      providerMessageId = faxResult.providerMessageId;
      providerStatus = "queued";
      attachmentPaths = faxResult.storagePath ? [faxResult.storagePath] : null;
    }

    const sentAt = new Date().toISOString();
    await supabaseAdmin
      .from("facility_packet_delivery_attempts")
      .update({
        status: "sent",
        provider,
        provider_message_id: providerMessageId,
        provider_status: providerStatus,
        attachment_paths: attachmentPaths,
        sent_at: sentAt,
        error_message: null,
      })
      .eq("id", attempt.id);

    const updatedAttempt = { ...attempt, status: "sent" as const, sent_at: sentAt, provider, provider_message_id: providerMessageId };

    return completeSuccessfulSend({
      staff,
      row,
      packetRequestId,
      attempt: updatedAttempt,
      attemptCount,
      facilityName,
      method,
      mappedDeliveryMethod: method,
      materialLabels: materialNames,
      recipientLabel: recipientName ?? facilityName,
      recipientEmail,
      recipientFax,
      sentNotes: "",
      createFollowUp: input.create_follow_up !== false,
      followUpDueAt: input.follow_up_due_at,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Delivery failed.";
    await failAttempt(attempt.id, packetRequestId, "SEND_FAILED", message, attemptCount);
    queueFacilityNotification(() =>
      createFacilityNotification({
        userId: row.assigned_to ?? staff.user_id,
        notificationType: "facility_packet_send_failed",
        title: "Packet send failed",
        message: `Could not send packet to ${facilityName}: ${message}`,
        severity: "urgent",
        facilityId: row.facility_id,
        actionUrl: `/admin/facilities/packets?status=pending`,
        metadata: { packet_request_id: packetRequestId, delivery_attempt_id: attempt.id },
        dedupeKey: `facility_packet_send_failed:${attempt.id}`,
      })
    );
    return {
      ok: false,
      code: "SEND_FAILED",
      message,
      delivery_attempt: await reloadAttempt(attempt.id),
    };
  }
}

async function reloadAttempt(id: string): Promise<PacketDeliveryAttemptRow> {
  const { data } = await supabaseAdmin
    .from("facility_packet_delivery_attempts")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return mapAttempt((data ?? { id }) as Record<string, unknown>);
}

async function failAttempt(
  attemptId: string,
  packetRequestId: string,
  code: string,
  message: string,
  attemptCount: number
) {
  await supabaseAdmin
    .from("facility_packet_delivery_attempts")
    .update({ status: "failed", error_message: message })
    .eq("id", attemptId);
  await supabaseAdmin
    .from("facility_packet_requests")
    .update({
      status: "failed",
      delivery_error: message,
      last_delivery_status: "failed",
      delivery_attempt_count: attemptCount,
    })
    .eq("id", packetRequestId);
}

async function completeSuccessfulSend(input: {
  staff: StaffProfile;
  row: PacketRequestRow;
  packetRequestId: string;
  attempt: PacketDeliveryAttemptRow;
  attemptCount: number;
  facilityName: string;
  method: "email" | "fax" | "manual";
  mappedDeliveryMethod: PacketDeliveryMethod | null;
  materialLabels: string;
  recipientLabel: string;
  recipientEmail: string | null;
  recipientFax: string | null;
  sentNotes: string;
  createFollowUp: boolean;
  followUpDueAt?: string | null;
}): Promise<SendPacketRequestResult> {
  const sentAt = new Date().toISOString();
  const deliveryMethod = input.mappedDeliveryMethod ?? (input.method === "email" ? "email" : input.method === "fax" ? "fax" : "other");

  let activityType = "Other";
  let outcome = "Left Materials";
  let activityNotes = "";

  if (input.method === "email") {
    activityType = "Email";
    outcome = "Wants Email Info";
    activityNotes = `Packet sent by email to ${input.recipientEmail ?? input.recipientLabel}. Materials: ${input.materialLabels}.`;
  } else if (input.method === "fax") {
    activityType = "Fax";
    outcome = "Wants Packet Faxed";
    activityNotes = `Packet faxed to ${input.recipientFax ?? "recipient"}. Materials: ${input.materialLabels}.`;
  } else {
    activityType = "Packet Dropped";
    outcome = "Left Materials";
    activityNotes = `Packet marked sent manually. Materials: ${input.materialLabels}.${input.sentNotes ? ` ${input.sentNotes}` : ""}`;
  }

  const activityResult = await saveFacilityActivityRecord(supabaseAdmin, {
    facility_id: input.row.facility_id,
    staff_user_id: input.staff.user_id,
    activity_type: activityType,
    outcome,
    notes: activityNotes,
    requested_packet: false,
    materials_dropped_off: input.method === "manual",
  });

  let activityId: string | undefined;
  if (activityResult.ok && activityResult.activity?.id) {
    activityId = String(activityResult.activity.id);
  }

  let followUpTaskId: string | null = input.row.follow_up_task_id;
  if (input.createFollowUp) {
    const dueAt =
      input.followUpDueAt ??
      `${addCalendarDaysToIsoDate(getCrmCalendarTodayIso(), 1)}T17:00:00.000Z`;
    const { data: task, error: taskErr } = await supabaseAdmin
      .from("facility_follow_up_tasks")
      .insert({
        facility_id: input.row.facility_id,
        activity_id: activityId ?? input.row.activity_id,
        contact_id: input.row.contact_id,
        assigned_to: input.row.assigned_to ?? input.staff.user_id,
        title: "Confirm packet received",
        description: `Follow up on packet sent to ${input.facilityName}.`,
        due_at: dueAt,
        status: "open",
        priority: input.row.priority,
        source: "packet",
        packet_request_id: input.packetRequestId,
        created_by: input.staff.user_id,
      })
      .select("id")
      .maybeSingle();

    if (!taskErr && task?.id) {
      followUpTaskId = String(task.id);
      void notifyFollowUpTaskAssigned({
        taskId: followUpTaskId,
        facilityId: input.row.facility_id,
        facilityName: input.facilityName,
        title: "Confirm packet received",
        assignedToUserId: input.row.assigned_to ?? input.staff.user_id,
        dueAt,
      });
    }
  }

  const { data: updatedRequest, error } = await supabaseAdmin
    .from("facility_packet_requests")
    .update({
      status: "sent",
      sent_at: sentAt,
      sent_by: input.staff.user_id,
      sent_notes: input.sentNotes || null,
      delivery_method: deliveryMethod,
      follow_up_task_id: followUpTaskId,
      last_delivery_attempt_id: input.attempt.id,
      last_delivery_status: "sent",
      delivery_error: null,
      delivery_attempt_count: input.attemptCount,
      material_ids: input.attempt.material_ids ?? input.row.material_ids,
    })
    .eq("id", input.packetRequestId)
    .select("*")
    .single();

  if (error || !updatedRequest) {
    return { ok: false, code: "UPDATE_FAILED", message: "Sent but could not update packet request." };
  }

  const notifyUserId = input.row.requested_by_user_id ?? input.row.assigned_to;
  if (notifyUserId && notifyUserId !== input.staff.user_id) {
    queueFacilityNotification(() =>
      createFacilityNotification({
        userId: notifyUserId,
        notificationType: "facility_packet_sent",
        title: "Packet sent",
        message: `Packet sent to ${input.facilityName}.`,
        severity: "success",
        facilityId: input.row.facility_id,
        actionUrl: `/admin/facilities/packets?status=sent`,
        metadata: { packet_request_id: input.packetRequestId },
        dedupeKey: `facility_packet_sent:${input.packetRequestId}`,
      })
    );
  }

  return {
    ok: true,
    packet_request: mapRequestRow(updatedRequest as Record<string, unknown>),
    delivery_attempt: input.attempt,
    activity_id: activityId,
    follow_up_task_id: followUpTaskId,
  };
}

export async function getPacketDeliveryConfig(): Promise<{
  emailConfigured: boolean;
  faxConfigured: boolean;
}> {
  return {
    emailConfigured: isFacilityPacketEmailConfigured(),
    faxConfigured: isFacilityPacketFaxConfigured(),
  };
}
