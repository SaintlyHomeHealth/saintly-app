import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { buildFacilityFullAddress } from "@/lib/crm/facility-address";
import {
  addCalendarDaysToIsoDate,
  getCrmCalendarDateIsoFromInstant,
  getCrmCalendarTodayIso,
} from "@/lib/crm/crm-local-date";
import { staffLabelFromLookup } from "@/lib/crm/crm-leads-table-helpers";
import { saveFacilityActivityRecord } from "@/lib/crm/facility-activity-save";
import { notifyFollowUpTaskAssigned } from "@/lib/crm/facility-notifications";
import {
  createFacilityNotification,
  queueFacilityNotification,
} from "@/lib/crm/facility-notifications";
import type {
  PacketDeliveryMethod,
  PacketMaterialRow,
  PacketPriority,
  PacketRequestCard,
  PacketRequestRow,
  PacketRequestSource,
  PacketRequestStatus,
  PacketType,
} from "@/lib/crm/facility-packet-types";
import type { StaffProfile } from "@/lib/staff-profile";
import {
  canAccessFacilityAdminTools,
  canAccessFacilityFieldTools,
  isSalesAgentRole,
} from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CreatePacketRequestInput = {
  facility_id: string;
  contact_id?: string | null;
  activity_id?: string | null;
  lead_id?: string | null;
  campaign_id?: string | null;
  campaign_step_instance_id?: string | null;
  delivery_method?: PacketDeliveryMethod | null;
  packet_type?: PacketType | null;
  assigned_to?: string | null;
  due_at?: string | null;
  priority?: PacketPriority;
  recipient_name?: string | null;
  recipient_role?: string | null;
  recipient_email?: string | null;
  recipient_fax?: string | null;
  recipient_phone?: string | null;
  notes?: string | null;
  source?: PacketRequestSource;
  force_create?: boolean;
};

export type ListPacketRequestsFilters = {
  status?: string;
  assigned_to?: string;
  facility_id?: string;
  delivery_method?: string;
  packet_type?: string;
  due?: "today" | "overdue" | "pending";
  city?: string;
  facility_type?: string;
  priority?: string;
  limit?: number;
  offset?: number;
};

function mapRow(raw: Record<string, unknown>): PacketRequestRow {
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
    status: (raw.status as PacketRequestStatus) ?? "pending",
    priority: (raw.priority as PacketPriority) ?? "Normal",
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
    packet_type: (raw.packet_type as PacketType | null) ?? null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    sent_notes: typeof raw.sent_notes === "string" ? raw.sent_notes : null,
    follow_up_task_id: typeof raw.follow_up_task_id === "string" ? raw.follow_up_task_id : null,
    metadata:
      raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
        ? (raw.metadata as Record<string, unknown>)
        : null,
    last_delivery_attempt_id:
      typeof raw.last_delivery_attempt_id === "string" ? raw.last_delivery_attempt_id : null,
    delivery_attempt_count: typeof raw.delivery_attempt_count === "number" ? raw.delivery_attempt_count : 0,
    delivery_error: typeof raw.delivery_error === "string" ? raw.delivery_error : null,
    last_delivery_status: typeof raw.last_delivery_status === "string" ? raw.last_delivery_status : null,
    material_ids: Array.isArray(raw.material_ids) ? (raw.material_ids as string[]) : null,
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

function canViewPacketRequest(staff: StaffProfile, row: PacketRequestRow, facilityRepId: string | null): boolean {
  if (!canAccessFacilityFieldTools(staff)) return false;
  if (canAccessFacilityAdminTools(staff)) return true;
  if (row.assigned_to === staff.user_id) return true;
  if (row.requested_by_user_id === staff.user_id) return true;
  if (facilityRepId === staff.user_id) return true;
  return false;
}

function canMutatePacketRequest(staff: StaffProfile, row: PacketRequestRow, facilityRepId: string | null): boolean {
  if (canAccessFacilityAdminTools(staff)) return true;
  if (!canAccessFacilityFieldTools(staff)) return false;
  if (row.assigned_to === staff.user_id) return true;
  if (row.requested_by_user_id === staff.user_id) return true;
  if (facilityRepId === staff.user_id) return true;
  return false;
}

export async function findOpenDuplicatePacketRequest(input: {
  facility_id: string;
  contact_id?: string | null;
  packet_type?: PacketType | null;
  delivery_method?: PacketDeliveryMethod | null;
}): Promise<PacketRequestRow | null> {
  let query = supabaseAdmin
    .from("facility_packet_requests")
    .select("*")
    .eq("facility_id", input.facility_id)
    .eq("status", "pending");

  if (input.contact_id) query = query.eq("contact_id", input.contact_id);
  if (input.packet_type) query = query.eq("packet_type", input.packet_type);
  if (input.delivery_method) query = query.eq("delivery_method", input.delivery_method);

  const { data } = await query.order("requested_at", { ascending: false }).limit(1).maybeSingle();
  return data ? mapRow(data as Record<string, unknown>) : null;
}

export async function createPacketRequest(
  staff: StaffProfile,
  input: CreatePacketRequestInput
): Promise<
  | { ok: true; id: string; duplicate_warning?: boolean; existing_id?: string }
  | { ok: false; error: string; existing_id?: string }
> {
  if (!canAccessFacilityFieldTools(staff)) return { ok: false, error: "forbidden" };
  if (!UUID_RE.test(input.facility_id)) return { ok: false, error: "invalid_facility" };

  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("id, name, fax, email, main_phone, assigned_rep_user_id")
    .eq("id", input.facility_id)
    .maybeSingle();
  if (!facility?.id) return { ok: false, error: "facility_not_found" };

  if (!input.force_create) {
    const dup = await findOpenDuplicatePacketRequest(input);
    if (dup) return { ok: false, error: "duplicate_open", existing_id: dup.id };
  }

  const assignedTo =
    input.assigned_to && UUID_RE.test(input.assigned_to)
      ? input.assigned_to
      : (facility as { assigned_rep_user_id?: string | null }).assigned_rep_user_id ?? staff.user_id;

  const tomorrow = `${addCalendarDaysToIsoDate(getCrmCalendarTodayIso(), 1)}T17:00:00.000Z`;
  const dueAt = input.due_at ?? tomorrow;

  const metadata: Record<string, unknown> = { source: input.source ?? "manual" };

  const { data, error } = await supabaseAdmin
    .from("facility_packet_requests")
    .insert({
      facility_id: input.facility_id,
      contact_id: input.contact_id ?? null,
      activity_id: input.activity_id ?? null,
      lead_id: input.lead_id ?? null,
      campaign_id: input.campaign_id ?? null,
      campaign_step_instance_id: input.campaign_step_instance_id ?? null,
      requested_by_user_id: staff.user_id,
      assigned_to: assignedTo,
      delivery_method: input.delivery_method ?? null,
      packet_type: input.packet_type ?? "general_agency_packet",
      priority: input.priority ?? "Normal",
      due_at: dueAt,
      recipient_name: input.recipient_name ?? null,
      recipient_role: input.recipient_role ?? null,
      recipient_email: input.recipient_email ?? (facility as { email?: string | null }).email ?? null,
      recipient_fax: input.recipient_fax ?? (facility as { fax?: string | null }).fax ?? null,
      recipient_phone: input.recipient_phone ?? (facility as { main_phone?: string | null }).main_phone ?? null,
      notes: (input.notes ?? "").trim() || null,
      metadata,
      status: "pending",
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) return { ok: false, error: "create_failed" };
  const id = String(data.id);

  queueFacilityNotification(() =>
    createFacilityNotification({
      userId: assignedTo,
      notificationType: "facility_packet_request_created",
      title: "New packet request",
      message: `${String((facility as { name?: string }).name ?? "Facility")} requested a packet.`,
      severity: "info",
      facilityId: input.facility_id,
      activityId: input.activity_id ?? null,
      actionUrl: `/admin/facilities/packets?status=pending`,
      metadata: { packet_request_id: id },
      dedupeKey: `facility_packet_request_created:${input.facility_id}:${id}`,
    })
  );

  return { ok: true, id };
}

async function enrichCards(rows: PacketRequestRow[]): Promise<PacketRequestCard[]> {
  if (!rows.length) return [];
  const today = getCrmCalendarTodayIso();
  const staffById = await staffLookup();
  const facilityIds = [...new Set(rows.map((r) => r.facility_id))];
  const { data: facs } = await supabaseAdmin
    .from("facilities")
    .select("id, name, type, city, main_phone, address_line_1, address_line_2, state, zip, latitude, longitude")
    .in("id", facilityIds);
  const facById: Record<string, Record<string, unknown>> = {};
  for (const f of facs ?? []) facById[(f as { id: string }).id] = f as Record<string, unknown>;

  const { loadPacketReferralLinkStatsByRequestIds } = await import("@/lib/crm/facility-referral-source-links");
  const referralStats = await loadPacketReferralLinkStatsByRequestIds(rows.map((r) => r.id));

  return rows.map((r) => {
    const fac = facById[r.facility_id];
    const dueYmd = r.due_at ? getCrmCalendarDateIsoFromInstant(new Date(r.due_at)) : null;
    const isOverdue = r.status === "pending" && dueYmd !== null && dueYmd < today;
    const isDueToday = r.status === "pending" && dueYmd === today;
    const source = (r.metadata?.source as PacketRequestSource | undefined) ?? null;

    return {
      ...r,
      facility_name: String(fac?.name ?? "Facility"),
      facility_type: typeof fac?.type === "string" ? fac.type : null,
      facility_city: typeof fac?.city === "string" ? fac.city : null,
      facility_phone: typeof fac?.main_phone === "string" ? fac.main_phone : null,
      facility_address: fac ? buildFacilityFullAddress(fac as Parameters<typeof buildFacilityFullAddress>[0]) : "",
      facility_latitude: typeof fac?.latitude === "number" ? fac.latitude : null,
      facility_longitude: typeof fac?.longitude === "number" ? fac.longitude : null,
      assigned_to_label: r.assigned_to ? staffLabelFromLookup(r.assigned_to, staffById) : null,
      requested_by_label: r.requested_by_user_id ? staffLabelFromLookup(r.requested_by_user_id, staffById) : null,
      sent_by_label: r.sent_by ? staffLabelFromLookup(r.sent_by, staffById) : null,
      source,
      is_overdue: isOverdue,
      is_due_today: isDueToday,
      referral_link: referralStats.get(r.id) ?? null,
    };
  });
}

export async function listPacketRequests(
  staff: StaffProfile,
  filters: ListPacketRequestsFilters
): Promise<{ requests: PacketRequestCard[]; total: number }> {
  if (!canAccessFacilityFieldTools(staff)) return { requests: [], total: 0 };

  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const offset = Math.max(filters.offset ?? 0, 0);
  const today = getCrmCalendarTodayIso();

  let query = supabaseAdmin.from("facility_packet_requests").select("*", { count: "exact" });

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.assigned_to && UUID_RE.test(filters.assigned_to)) query = query.eq("assigned_to", filters.assigned_to);
  if (filters.facility_id && UUID_RE.test(filters.facility_id)) query = query.eq("facility_id", filters.facility_id);
  if (filters.delivery_method) query = query.eq("delivery_method", filters.delivery_method);
  if (filters.packet_type) query = query.eq("packet_type", filters.packet_type);
  if (filters.priority) query = query.eq("priority", filters.priority);

  if (filters.due === "today") {
    query = query.eq("status", "pending").gte("due_at", `${today}T00:00:00.000Z`).lte("due_at", `${today}T23:59:59.999Z`);
  } else if (filters.due === "overdue") {
    query = query.eq("status", "pending").lt("due_at", `${today}T00:00:00.000Z`);
  } else if (filters.due === "pending") {
    query = query.eq("status", "pending");
  }

  query = query.order("due_at", { ascending: true, nullsFirst: false }).range(offset, offset + limit - 1);

  const { data, count } = await query;
  let rows = (data ?? []).map((r) => mapRow(r as Record<string, unknown>));

  if (filters.city?.trim() || filters.facility_type?.trim()) {
    const facilityIds = [...new Set(rows.map((r) => r.facility_id))];
    if (facilityIds.length) {
      let fq = supabaseAdmin.from("facilities").select("id, city, type").in("id", facilityIds);
      const { data: facRows } = await fq;
      const allowed = new Set<string>();
      for (const f of facRows ?? []) {
        const id = String((f as { id: string }).id);
        const city = String((f as { city?: string }).city ?? "");
        const type = String((f as { type?: string }).type ?? "");
        if (filters.city?.trim() && !city.toLowerCase().includes(filters.city.trim().toLowerCase())) continue;
        if (filters.facility_type?.trim() && !type.toLowerCase().includes(filters.facility_type.trim().toLowerCase())) continue;
        allowed.add(id);
      }
      rows = rows.filter((r) => allowed.has(r.facility_id));
    }
  }

  if (!canAccessFacilityAdminTools(staff) && isSalesAgentRole(staff)) {
    const facilityIds = [...new Set(rows.map((r) => r.facility_id))];
    const { data: facReps } = facilityIds.length
      ? await supabaseAdmin.from("facilities").select("id, assigned_rep_user_id").in("id", facilityIds)
      : { data: [] };
    const repByFac: Record<string, string | null> = {};
    for (const f of facReps ?? []) {
      repByFac[(f as { id: string }).id] = (f as { assigned_rep_user_id?: string | null }).assigned_rep_user_id ?? null;
    }
    rows = rows.filter((r) => canViewPacketRequest(staff, r, repByFac[r.facility_id] ?? null));
  }

  const cards = await enrichCards(rows);
  return { requests: cards, total: count ?? cards.length };
}

async function loadPacketRequestForStaff(
  staff: StaffProfile,
  packetRequestId: string
): Promise<{ row: PacketRequestRow; facilityRepId: string | null } | null> {
  if (!UUID_RE.test(packetRequestId)) return null;
  const { data } = await supabaseAdmin
    .from("facility_packet_requests")
    .select("*")
    .eq("id", packetRequestId)
    .maybeSingle();
  if (!data) return null;
  const row = mapRow(data as Record<string, unknown>);
  const { data: fac } = await supabaseAdmin
    .from("facilities")
    .select("assigned_rep_user_id")
    .eq("id", row.facility_id)
    .maybeSingle();
  const facilityRepId = (fac as { assigned_rep_user_id?: string | null } | null)?.assigned_rep_user_id ?? null;
  if (!canViewPacketRequest(staff, row, facilityRepId)) return null;
  return { row, facilityRepId };
}

function activityTypeForDelivery(method: PacketDeliveryMethod | null): string {
  if (method === "fax") return "Fax Drop";
  if (method === "email") return "Email";
  if (method === "print_dropoff" || method === "hand_delivered") return "Packet Dropped";
  return "Other";
}

function outcomeForDelivery(method: PacketDeliveryMethod | null): string {
  if (method === "fax") return "Wants Packet Faxed";
  if (method === "email") return "Wants Email Info";
  return "Left Materials";
}

export async function markPacketRequestSent(
  staff: StaffProfile,
  packetRequestId: string,
  input: {
    sent_method?: PacketDeliveryMethod | null;
    sent_at?: string | null;
    sent_notes?: string | null;
    create_follow_up?: boolean;
    follow_up_due_at?: string | null;
    create_referral_link?: boolean;
    material_ids?: string[];
  }
): Promise<
  | {
      ok: true;
      activity_id?: string;
      follow_up_task_id?: string | null;
      referral_link?: {
        id: string;
        public_url: string;
        token_segment: string;
      } | null;
    }
  | { ok: false; error: string }
> {
  const loaded = await loadPacketRequestForStaff(staff, packetRequestId);
  if (!loaded) return { ok: false, error: "not_found" };
  const { row, facilityRepId } = loaded;
  if (!canMutatePacketRequest(staff, row, facilityRepId)) return { ok: false, error: "forbidden" };
  if (row.status !== "pending" && row.status !== "failed") return { ok: false, error: "invalid_status" };

  const sentAt = input.sent_at ?? new Date().toISOString();
  const method = input.sent_method ?? row.delivery_method ?? "other";
  const sentNotes = (input.sent_notes ?? "").trim();

  const { data: facility } = await supabaseAdmin
    .from("facilities")
    .select("id, name")
    .eq("id", row.facility_id)
    .maybeSingle();

  const activityNotes = [
    `Packet sent via ${method}.`,
    sentNotes,
    row.recipient_name ? `Recipient: ${row.recipient_name}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const activityResult = await saveFacilityActivityRecord(supabaseAdmin, {
    facility_id: row.facility_id,
    staff_user_id: staff.user_id,
    activity_type: activityTypeForDelivery(method),
    outcome: outcomeForDelivery(method),
    notes: activityNotes,
    requested_packet: false,
    materials_dropped_off: method === "hand_delivered" || method === "print_dropoff",
  });

  let activityId: string | undefined;
  if (activityResult.ok && activityResult.activity?.id) {
    activityId = String(activityResult.activity.id);
  }

  let followUpTaskId: string | null = row.follow_up_task_id;

  if (input.create_follow_up !== false) {
    const dueAt =
      input.follow_up_due_at ??
      `${addCalendarDaysToIsoDate(getCrmCalendarTodayIso(), 1)}T17:00:00.000Z`;
    const { data: task, error: taskErr } = await supabaseAdmin
      .from("facility_follow_up_tasks")
      .insert({
        facility_id: row.facility_id,
        activity_id: activityId ?? row.activity_id,
        contact_id: row.contact_id,
        assigned_to: row.assigned_to ?? staff.user_id,
        title: "Confirm packet received",
        description: `Follow up on packet sent to ${String((facility as { name?: string }).name ?? "facility")}.`,
        due_at: dueAt,
        status: "open",
        priority: row.priority,
        source: "packet",
        packet_request_id: packetRequestId,
        created_by: staff.user_id,
      })
      .select("id")
      .maybeSingle();

    if (!taskErr && task?.id) {
      followUpTaskId = String(task.id);
      void notifyFollowUpTaskAssigned({
        taskId: followUpTaskId,
        facilityId: row.facility_id,
        facilityName: String((facility as { name?: string }).name ?? "Facility"),
        title: "Confirm packet received",
        assignedToUserId: row.assigned_to ?? staff.user_id,
        dueAt,
      });
    }
  }

  const { error } = await supabaseAdmin
    .from("facility_packet_requests")
    .update({
      status: "sent",
      sent_at: sentAt,
      sent_by: staff.user_id,
      sent_notes: sentNotes || null,
      delivery_method: method,
      follow_up_task_id: followUpTaskId,
    })
    .eq("id", packetRequestId);

  if (error) return { ok: false, error: "update_failed" };

  let referralLink: { id: string; public_url: string; token_segment: string } | null = null;
  if (input.create_referral_link !== false) {
    try {
      const { getOrCreatePacketReferralSourceLink } = await import("@/lib/crm/facility-referral-source-links");
      const linkResult = await getOrCreatePacketReferralSourceLink(packetRequestId, {
        material_ids: input.material_ids ?? row.material_ids ?? undefined,
        delivery_method: method,
        created_by: staff.user_id,
      });
      if (linkResult.ok) {
        referralLink = {
          id: linkResult.link.id,
          public_url: linkResult.public_url,
          token_segment: linkResult.token_segment,
        };
      }
    } catch (linkErr) {
      console.warn("[markPacketRequestSent] referral link:", linkErr);
    }
  }

  const notifyUserId = row.requested_by_user_id ?? row.assigned_to;
  if (notifyUserId && notifyUserId !== staff.user_id) {
    queueFacilityNotification(() =>
      createFacilityNotification({
        userId: notifyUserId,
        notificationType: "facility_packet_sent",
        title: "Packet sent",
        message: `Packet sent for ${String((facility as { name?: string }).name ?? "facility")}.`,
        severity: "success",
        facilityId: row.facility_id,
        actionUrl: `/admin/facilities/packets?status=sent`,
        metadata: { packet_request_id: packetRequestId },
        dedupeKey: `facility_packet_sent:${packetRequestId}`,
      })
    );
  }

  return { ok: true, activity_id: activityId, follow_up_task_id: followUpTaskId, referral_link: referralLink };
}

export async function confirmPacketRequestReceived(
  staff: StaffProfile,
  packetRequestId: string,
  input: { confirmed_at?: string | null; note?: string | null }
): Promise<{ ok: true; activity_id?: string } | { ok: false; error: string }> {
  const loaded = await loadPacketRequestForStaff(staff, packetRequestId);
  if (!loaded) return { ok: false, error: "not_found" };
  const { row, facilityRepId } = loaded;
  if (!canMutatePacketRequest(staff, row, facilityRepId)) return { ok: false, error: "forbidden" };
  if (row.status !== "sent") return { ok: false, error: "invalid_status" };

  const confirmedAt = input.confirmed_at ?? new Date().toISOString();
  const note = (input.note ?? "").trim();

  const activityResult = await saveFacilityActivityRecord(supabaseAdmin, {
    facility_id: row.facility_id,
    staff_user_id: staff.user_id,
    activity_type: "Follow-Up Visit",
    outcome: "Good Conversation",
    notes: ["Confirmed packet received.", note].filter(Boolean).join("\n"),
  });

  const { error } = await supabaseAdmin
    .from("facility_packet_requests")
    .update({
      status: "confirmed_received",
      confirmed_received_at: confirmedAt,
      confirmed_by: staff.user_id,
    })
    .eq("id", packetRequestId);

  if (error) return { ok: false, error: "update_failed" };

  queueFacilityNotification(() =>
    createFacilityNotification({
      userId: row.assigned_to ?? staff.user_id,
      notificationType: "facility_packet_confirm_received",
      title: "Packet receipt confirmed",
      message: "Packet receipt confirmed at facility.",
      severity: "success",
      facilityId: row.facility_id,
      actionUrl: `/admin/facilities/${row.facility_id}`,
      metadata: { packet_request_id: packetRequestId },
      dedupeKey: `facility_packet_confirm_received:${packetRequestId}`,
    })
  );

  return {
    ok: true,
    activity_id: activityResult.ok && activityResult.activity?.id ? String(activityResult.activity.id) : undefined,
  };
}

export async function reschedulePacketRequest(
  staff: StaffProfile,
  packetRequestId: string,
  due_at: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadPacketRequestForStaff(staff, packetRequestId);
  if (!loaded) return { ok: false, error: "not_found" };
  if (!canMutatePacketRequest(staff, loaded.row, loaded.facilityRepId)) return { ok: false, error: "forbidden" };
  if (loaded.row.status !== "pending") return { ok: false, error: "invalid_status" };

  const { error } = await supabaseAdmin
    .from("facility_packet_requests")
    .update({ due_at })
    .eq("id", packetRequestId);

  return error ? { ok: false, error: "update_failed" } : { ok: true };
}

export async function cancelPacketRequest(
  staff: StaffProfile,
  packetRequestId: string,
  reason?: string | null
): Promise<{ ok: true } | { ok: false; error: string }> {
  const loaded = await loadPacketRequestForStaff(staff, packetRequestId);
  if (!loaded) return { ok: false, error: "not_found" };
  if (!canAccessFacilityAdminTools(staff) && !canMutatePacketRequest(staff, loaded.row, loaded.facilityRepId)) {
    return { ok: false, error: "forbidden" };
  }
  if (loaded.row.status === "confirmed_received" || loaded.row.status === "canceled") {
    return { ok: false, error: "invalid_status" };
  }

  const notes = [loaded.row.notes, reason ? `Canceled: ${reason}` : null].filter(Boolean).join("\n");
  const { error } = await supabaseAdmin
    .from("facility_packet_requests")
    .update({ status: "canceled", notes: notes || loaded.row.notes })
    .eq("id", packetRequestId);

  return error ? { ok: false, error: "update_failed" } : { ok: true };
}

export async function listPacketMaterials(staff: StaffProfile): Promise<PacketMaterialRow[]> {
  const { listActivePacketMaterials } = await import("@/lib/crm/facility-packet-materials");
  return listActivePacketMaterials(staff);
}

export async function savePacketMaterial(
  staff: StaffProfile,
  input: { name: string; description?: string | null; packet_type?: PacketType | null; external_url?: string | null }
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const { createPacketMaterial } = await import("@/lib/crm/facility-packet-materials");
  const result = await createPacketMaterial(staff, input);
  if (!result.ok) return result;
  return { ok: true, id: result.material.id };
}

export async function syncPacketRequestAlerts(staff: StaffProfile): Promise<void> {
  if (!canAccessFacilityFieldTools(staff)) return;
  const today = getCrmCalendarTodayIso();

  let query = supabaseAdmin
    .from("facility_packet_requests")
    .select("id, facility_id, assigned_to, due_at, status")
    .eq("status", "pending");

  if (!canAccessFacilityAdminTools(staff)) {
    query = query.eq("assigned_to", staff.user_id);
  }

  const { data: rows } = await query;
  for (const raw of rows ?? []) {
    const r = raw as { id: string; facility_id: string; assigned_to: string | null; due_at: string | null };
    if (!r.assigned_to) continue;
    const dueYmd = r.due_at ? getCrmCalendarDateIsoFromInstant(new Date(r.due_at)) : null;
    if (!dueYmd) continue;

    const { data: fac } = await supabaseAdmin.from("facilities").select("name").eq("id", r.facility_id).maybeSingle();
    const facName = String((fac as { name?: string } | null)?.name ?? "Facility");

    if (dueYmd === today) {
      queueFacilityNotification(() =>
        createFacilityNotification({
          userId: r.assigned_to!,
          notificationType: "facility_packet_request_due",
          title: "Packet request due today",
          message: `Send packet for ${facName}.`,
          severity: "warning",
          facilityId: r.facility_id,
          actionUrl: "/admin/facilities/packets?due=today",
          metadata: { packet_request_id: r.id },
          dedupeKey: `facility_packet_request_due:${r.id}:${today}`,
        })
      );
    } else if (dueYmd < today) {
      queueFacilityNotification(() =>
        createFacilityNotification({
          userId: r.assigned_to!,
          notificationType: "facility_packet_request_overdue",
          title: "Overdue packet request",
          message: `Packet still pending for ${facName}.`,
          severity: "urgent",
          facilityId: r.facility_id,
          actionUrl: "/admin/facilities/packets?due=overdue",
          metadata: { packet_request_id: r.id },
          dedupeKey: `facility_packet_request_overdue:${r.id}:${today}`,
        })
      );
    }
  }
}

export async function listPacketRequestsForFacility(
  staff: StaffProfile,
  facilityId: string
): Promise<PacketRequestCard[]> {
  const { requests } = await listPacketRequests(staff, { facility_id: facilityId, limit: 50, status: "all" });
  return requests;
}

export async function loadOutreachPacketRequests(staff: StaffProfile): Promise<PacketRequestCard[]> {
  if (!canAccessFacilityFieldTools(staff)) return [];
  const filters: ListPacketRequestsFilters = { due: "pending", limit: 20 };
  if (!canAccessFacilityAdminTools(staff)) filters.assigned_to = staff.user_id;
  const { requests } = await listPacketRequests(staff, filters);
  return requests.filter((r) => r.is_overdue || r.is_due_today || r.status === "pending").slice(0, 15);
}

export async function loadPacketFulfillmentMetrics(
  staff: StaffProfile,
  startDate: string,
  endDate: string,
  repId?: string | null
): Promise<import("@/lib/crm/facility-packet-types").PacketFulfillmentSummary> {
  const empty: import("@/lib/crm/facility-packet-types").PacketFulfillmentSummary = {
    requestsCreated: 0,
    pending: 0,
    sent: 0,
    confirmedReceived: 0,
    overdue: 0,
    avgHoursRequestToSent: null,
    emailSent: 0,
    faxSent: 0,
    manualSent: 0,
    failedDeliveryAttempts: 0,
    avgAttemptsPerSentPacket: null,
    packetsWithoutMaterials: 0,
    byMaterialType: [],
    byFacilityType: [],
    byRep: [],
    facilities: [],
    packetLinksCreated: 0,
    packetLinkViews: 0,
    packetLinkSubmissions: 0,
    packetLinkLeads: 0,
    packetToLeadConversionRate: null,
    avgDaysPacketSentToReferral: null,
    topPacketMaterialsByLeads: [],
  };
  if (!canAccessFacilityFieldTools(staff)) return empty;

  const startIso = `${startDate}T00:00:00.000Z`;
  const endIso = `${endDate}T23:59:59.999Z`;
  const today = getCrmCalendarTodayIso();

  let query = supabaseAdmin
    .from("facility_packet_requests")
    .select("*")
    .gte("requested_at", startIso)
    .lte("requested_at", endIso);

  if (repId) query = query.eq("assigned_to", repId);

  const { data: rows } = await query;
  const all = (rows ?? []).map((r) => mapRow(r as Record<string, unknown>));

  const { data: allPending } = await supabaseAdmin
    .from("facility_packet_requests")
    .select("id, due_at, status")
    .eq("status", "pending");

  let overdue = 0;
  for (const p of allPending ?? []) {
    const due = (p as { due_at?: string }).due_at;
    if (due && getCrmCalendarDateIsoFromInstant(new Date(due)) < today) overdue++;
  }

  const sentRows = all.filter((r) => r.sent_at);
  let totalHours = 0;
  let sentCount = 0;
  for (const r of sentRows) {
    if (!r.sent_at) continue;
    const hrs = (new Date(r.sent_at).getTime() - new Date(r.requested_at).getTime()) / 3600000;
    if (hrs >= 0) {
      totalHours += hrs;
      sentCount++;
    }
  }

  const facilityIds = [...new Set(all.map((r) => r.facility_id))];
  const { data: facs } = facilityIds.length
    ? await supabaseAdmin.from("facilities").select("id, name, type").in("id", facilityIds)
    : { data: [] };
  const facById: Record<string, { name: string; type: string | null }> = {};
  for (const f of facs ?? []) {
    facById[(f as { id: string }).id] = {
      name: String((f as { name?: string }).name ?? "Facility"),
      type: (f as { type?: string | null }).type ?? null,
    };
  }

  const { data: referralRows } = facilityIds.length
    ? await supabaseAdmin
        .from("leads")
        .select("referring_facility_id, created_at")
        .in("referring_facility_id", facilityIds)
        .is("deleted_at", null)
    : { data: [] };

  const staffById = await staffLookup();
  const byType: Record<string, { requests: number; sent: number; confirmed: number; referralsAfter: number }> = {};
  const byRep: Record<string, { requests: number; sent: number; confirmed: number }> = {};
  const byFac: Record<
    string,
    { requests: number; sent: number; confirmed: number; lastSent: string | null; referralsAfter: number }
  > = {};

  for (const r of all) {
    const fac = facById[r.facility_id];
    const typeLabel = fac?.type ?? "Unknown";
    if (!byType[typeLabel]) byType[typeLabel] = { requests: 0, sent: 0, confirmed: 0, referralsAfter: 0 };
    byType[typeLabel].requests++;
    if (r.status === "sent" || r.status === "confirmed_received") byType[typeLabel].sent++;
    if (r.status === "confirmed_received") byType[typeLabel].confirmed++;

    const repIdKey = r.assigned_to ?? "unassigned";
    if (!byRep[repIdKey]) byRep[repIdKey] = { requests: 0, sent: 0, confirmed: 0 };
    byRep[repIdKey].requests++;
    if (r.status === "sent" || r.status === "confirmed_received") byRep[repIdKey].sent++;
    if (r.status === "confirmed_received") byRep[repIdKey].confirmed++;

    if (!byFac[r.facility_id]) {
      byFac[r.facility_id] = { requests: 0, sent: 0, confirmed: 0, lastSent: null, referralsAfter: 0 };
    }
    byFac[r.facility_id].requests++;
    if (r.status === "sent" || r.status === "confirmed_received") {
      byFac[r.facility_id].sent++;
      if (r.sent_at && (!byFac[r.facility_id].lastSent || r.sent_at > byFac[r.facility_id].lastSent!)) {
        byFac[r.facility_id].lastSent = r.sent_at;
      }
    }
    if (r.status === "confirmed_received") byFac[r.facility_id].confirmed++;
  }

  for (const lead of referralRows ?? []) {
    const fid = String((lead as { referring_facility_id: string }).referring_facility_id);
    const created = String((lead as { created_at: string }).created_at);
    const facStats = byFac[fid];
    if (!facStats?.lastSent) continue;
    if (created >= facStats.lastSent) {
      facStats.referralsAfter++;
      const typeLabel = facById[fid]?.type ?? "Unknown";
      if (byType[typeLabel]) byType[typeLabel].referralsAfter++;
    }
  }

  const sentRequestIds = all.filter((r) => r.status === "sent" || r.status === "confirmed_received").map((r) => r.id);
  let emailSent = 0;
  let faxSent = 0;
  let manualSent = 0;
  let failedDeliveryAttempts = 0;
  let totalAttemptsOnSent = 0;
  let packetsWithoutMaterials = 0;
  const byMaterialTypeCount: Record<string, number> = {};

  if (sentRequestIds.length) {
    for (const r of all) {
      if (r.status !== "sent" && r.status !== "confirmed_received") continue;
      totalAttemptsOnSent += r.delivery_attempt_count ?? 0;
      if (!r.material_ids?.length) packetsWithoutMaterials++;
      const pt = r.packet_type ?? "other";
      byMaterialTypeCount[pt] = (byMaterialTypeCount[pt] ?? 0) + 1;
    }

    const { data: attempts } = await supabaseAdmin
      .from("facility_packet_delivery_attempts")
      .select("delivery_method, status, sent_at")
      .in("packet_request_id", sentRequestIds)
      .gte("created_at", startIso)
      .lte("created_at", endIso);

    for (const a of attempts ?? []) {
      const method = String((a as { delivery_method?: string }).delivery_method ?? "");
      const status = String((a as { status?: string }).status ?? "");
      if (status === "failed") failedDeliveryAttempts++;
      if (status === "sent" || status === "accepted" || status === "delivered") {
        if (method === "email") emailSent++;
        else if (method === "fax") faxSent++;
        else if (method === "manual") manualSent++;
      }
    }
  }

  const { PACKET_TYPE_LABELS } = await import("@/lib/crm/facility-packet-types");

  const { count: packetLinksCreated } = await supabaseAdmin
    .from("facility_referral_source_links")
    .select("id", { count: "exact", head: true })
    .eq("link_type", "packet")
    .gte("created_at", startIso)
    .lte("created_at", endIso);

  const { data: packetLinksInRange } = await supabaseAdmin
    .from("facility_referral_source_links")
    .select("id, packet_material_id, metadata, packet_request_id")
    .eq("link_type", "packet")
    .gte("created_at", startIso)
    .lte("created_at", endIso)
    .limit(5000);

  const packetLinkIds = (packetLinksInRange ?? []).map((l) => String((l as { id: string }).id));
  let packetLinkViews = 0;
  let packetLinkSubmissions = 0;
  let packetLinkLeads = 0;
  const leadsByMaterial = new Map<string, number>();

  if (packetLinkIds.length) {
    const { data: linkEvents } = await supabaseAdmin
      .from("facility_referral_source_link_events")
      .select("source_link_id, event_type, metadata")
      .in("source_link_id", packetLinkIds)
      .gte("created_at", startIso)
      .lte("created_at", endIso)
      .limit(10000);

    const linkById = new Map(
      (packetLinksInRange ?? []).map((l) => [String((l as { id: string }).id), l as Record<string, unknown>])
    );

    for (const e of linkEvents ?? []) {
      const type = String((e as { event_type?: string }).event_type ?? "");
      if (type === "view") packetLinkViews++;
      if (type === "form_submitted") packetLinkSubmissions++;
      if (type === "lead_created") {
        packetLinkLeads++;
        const linkId = String((e as { source_link_id?: string }).source_link_id ?? "");
        const linkRow = linkById.get(linkId);
        const materialId =
          (typeof linkRow?.packet_material_id === "string" ? linkRow.packet_material_id : null) ??
          (Array.isArray(linkRow?.metadata) ? null : (linkRow?.metadata as Record<string, unknown> | undefined)?.packet_material_id);
        const matKey = typeof materialId === "string" ? materialId : "unknown";
        leadsByMaterial.set(matKey, (leadsByMaterial.get(matKey) ?? 0) + 1);
      }
    }
  }

  const sentWithReferralDays: number[] = [];
  for (const r of all) {
    const meta = r.metadata;
    const lastReferral =
      meta && typeof meta === "object" && !Array.isArray(meta)
        ? (meta as Record<string, unknown>).last_referral_from_packet_at
        : null;
    if (typeof lastReferral === "string" && r.sent_at) {
      const days = (new Date(lastReferral).getTime() - new Date(r.sent_at).getTime()) / 86400000;
      if (days >= 0) sentWithReferralDays.push(days);
    }
  }

  const materialIdsForLabels = [...leadsByMaterial.keys()].filter((id) => id !== "unknown" && UUID_RE.test(id));
  const materialNames = new Map<string, string>();
  if (materialIdsForLabels.length) {
    const { data: mats } = await supabaseAdmin
      .from("facility_packet_materials")
      .select("id, name")
      .in("id", materialIdsForLabels);
    for (const m of mats ?? []) {
      materialNames.set(String((m as { id: string }).id), String((m as { name?: string }).name ?? "Material"));
    }
  }

  const sentCountForRate = all.filter((r) => r.status === "sent" || r.status === "confirmed_received").length;

  return {
    requestsCreated: all.length,
    pending: all.filter((r) => r.status === "pending").length,
    sent: all.filter((r) => r.status === "sent" || r.status === "confirmed_received").length,
    confirmedReceived: all.filter((r) => r.status === "confirmed_received").length,
    overdue,
    avgHoursRequestToSent: sentCount > 0 ? Math.round(totalHours / sentCount) : null,
    emailSent,
    faxSent,
    manualSent,
    failedDeliveryAttempts,
    avgAttemptsPerSentPacket:
      sentRequestIds.length > 0 ? Math.round((totalAttemptsOnSent / sentRequestIds.length) * 10) / 10 : null,
    packetsWithoutMaterials,
    byMaterialType: Object.entries(byMaterialTypeCount).map(([packetType, count]) => ({
      packetType,
      label: PACKET_TYPE_LABELS[packetType as keyof typeof PACKET_TYPE_LABELS] ?? packetType,
      count,
    })),
    byFacilityType: Object.entries(byType).map(([label, v]) => ({ label, ...v })),
    byRep: Object.entries(byRep).map(([repUserId, v]) => ({
      repUserId,
      repLabel: repUserId === "unassigned" ? "Unassigned" : staffLabelFromLookup(repUserId, staffById),
      ...v,
    })),
    facilities: Object.entries(byFac).map(([facilityId, v]) => ({
      facilityId,
      facilityName: facById[facilityId]?.name ?? "Facility",
      requests: v.requests,
      sent: v.sent,
      confirmed: v.confirmed,
      referralsAfterPacket: v.referralsAfter,
      lastPacketSentAt: v.lastSent,
    })),
    packetLinksCreated: packetLinksCreated ?? 0,
    packetLinkViews,
    packetLinkSubmissions,
    packetLinkLeads,
    packetToLeadConversionRate:
      sentCountForRate > 0 ? Math.round((packetLinkLeads / sentCountForRate) * 1000) / 10 : null,
    avgDaysPacketSentToReferral:
      sentWithReferralDays.length > 0
        ? Math.round((sentWithReferralDays.reduce((a, b) => a + b, 0) / sentWithReferralDays.length) * 10) / 10
        : null,
    topPacketMaterialsByLeads: [...leadsByMaterial.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([materialId, leads]) => ({
        materialId,
        materialName: materialNames.get(materialId) ?? (materialId === "unknown" ? "Unknown material" : "Material"),
        leads,
      })),
  };
}
