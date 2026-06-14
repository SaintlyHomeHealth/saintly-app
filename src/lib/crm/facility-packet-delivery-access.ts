import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import type { PacketDeliveryMethod, PacketRequestRow } from "@/lib/crm/facility-packet-types";
import type { StaffProfile } from "@/lib/staff-profile";
import { canAccessFacilityAdminTools, canAccessFacilityFieldTools } from "@/lib/staff-profile";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function canViewPacketRequest(
  staff: StaffProfile,
  row: PacketRequestRow,
  facilityRepId: string | null
): boolean {
  if (!canAccessFacilityFieldTools(staff)) return false;
  if (canAccessFacilityAdminTools(staff)) return true;
  if (row.assigned_to === staff.user_id) return true;
  if (row.requested_by_user_id === staff.user_id) return true;
  if (facilityRepId === staff.user_id) return true;
  return false;
}

export function canMutatePacketRequest(
  staff: StaffProfile,
  row: PacketRequestRow,
  facilityRepId: string | null
): boolean {
  return canViewPacketRequest(staff, row, facilityRepId);
}

export async function loadPacketRequestForStaff(
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
