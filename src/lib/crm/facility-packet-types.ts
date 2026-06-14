export const PACKET_DELIVERY_METHODS = [
  "fax",
  "email",
  "print_dropoff",
  "hand_delivered",
  "portal_upload",
  "other",
] as const;
export type PacketDeliveryMethod = (typeof PACKET_DELIVERY_METHODS)[number];

export const PACKET_STATUSES = ["pending", "sent", "confirmed_received", "canceled", "failed"] as const;
export type PacketRequestStatus = (typeof PACKET_STATUSES)[number];

export const PACKET_PRIORITIES = ["Low", "Normal", "High"] as const;
export type PacketPriority = (typeof PACKET_PRIORITIES)[number];

export const PACKET_TYPES = [
  "general_agency_packet",
  "referral_packet",
  "wound_care_packet",
  "pediatric_packet",
  "private_pay_packet",
  "credentialing_packet",
  "other",
] as const;
export type PacketType = (typeof PACKET_TYPES)[number];

export const PACKET_REQUEST_SOURCES = ["quick_log", "ai_capture", "campaign", "manual"] as const;
export type PacketRequestSource = (typeof PACKET_REQUEST_SOURCES)[number];

export type PacketRequestRow = {
  id: string;
  facility_id: string;
  contact_id: string | null;
  activity_id: string | null;
  lead_id: string | null;
  campaign_id: string | null;
  campaign_step_instance_id: string | null;
  requested_by_user_id: string | null;
  assigned_to: string | null;
  delivery_method: PacketDeliveryMethod | null;
  status: PacketRequestStatus;
  priority: PacketPriority;
  requested_at: string;
  due_at: string | null;
  sent_at: string | null;
  sent_by: string | null;
  confirmed_received_at: string | null;
  confirmed_by: string | null;
  recipient_name: string | null;
  recipient_role: string | null;
  recipient_email: string | null;
  recipient_fax: string | null;
  recipient_phone: string | null;
  packet_type: PacketType | null;
  notes: string | null;
  sent_notes: string | null;
  follow_up_task_id: string | null;
  metadata: Record<string, unknown> | null;
  last_delivery_attempt_id: string | null;
  delivery_attempt_count: number;
  delivery_error: string | null;
  last_delivery_status: string | null;
  material_ids: string[] | null;
  created_at: string;
  updated_at: string;
};

export type PacketRequestCard = PacketRequestRow & {
  facility_name: string;
  facility_type: string | null;
  facility_city: string | null;
  facility_phone: string | null;
  facility_address: string;
  facility_latitude: number | null;
  facility_longitude: number | null;
  assigned_to_label: string | null;
  requested_by_label: string | null;
  sent_by_label: string | null;
  source: PacketRequestSource | null;
  is_overdue: boolean;
  is_due_today: boolean;
  referral_link?: {
    source_link_id: string;
    public_url: string;
    token_segment: string;
    view_count: number;
    leads_count: number;
    last_used_at: string | null;
    last_referral_at: string | null;
    delivery_method: string | null;
  } | null;
};

export type PacketMaterialRow = {
  id: string;
  name: string;
  description: string | null;
  packet_type: PacketType | null;
  storage_path: string | null;
  external_url: string | null;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const PACKET_SEND_DELIVERY_METHODS = ["email", "fax", "manual"] as const;
export type PacketSendDeliveryMethod = (typeof PACKET_SEND_DELIVERY_METHODS)[number];

export const PACKET_DELIVERY_ATTEMPT_STATUSES = [
  "pending",
  "sent",
  "failed",
  "accepted",
  "delivered",
  "canceled",
] as const;
export type PacketDeliveryAttemptStatus = (typeof PACKET_DELIVERY_ATTEMPT_STATUSES)[number];

export type PacketDeliveryAttemptRow = {
  id: string;
  packet_request_id: string;
  facility_id: string;
  contact_id: string | null;
  delivery_method: PacketSendDeliveryMethod;
  status: PacketDeliveryAttemptStatus;
  recipient_name: string | null;
  recipient_email: string | null;
  recipient_fax: string | null;
  subject: string | null;
  message: string | null;
  cover_sheet: string | null;
  material_ids: string[] | null;
  attachment_paths: string[] | null;
  provider: string | null;
  provider_message_id: string | null;
  provider_status: string | null;
  error_message: string | null;
  sent_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PacketFulfillmentSummary = {
  requestsCreated: number;
  pending: number;
  sent: number;
  confirmedReceived: number;
  overdue: number;
  avgHoursRequestToSent: number | null;
  emailSent: number;
  faxSent: number;
  manualSent: number;
  failedDeliveryAttempts: number;
  avgAttemptsPerSentPacket: number | null;
  packetsWithoutMaterials: number;
  byMaterialType: Array<{ packetType: string; label: string; count: number }>;
  byFacilityType: Array<{ label: string; requests: number; sent: number; confirmed: number; referralsAfter: number }>;
  byRep: Array<{ repUserId: string; repLabel: string; requests: number; sent: number; confirmed: number }>;
  facilities: Array<{
    facilityId: string;
    facilityName: string;
    requests: number;
    sent: number;
    confirmed: number;
    referralsAfterPacket: number;
    lastPacketSentAt: string | null;
  }>;
  packetLinksCreated: number;
  packetLinkViews: number;
  packetLinkSubmissions: number;
  packetLinkLeads: number;
  packetToLeadConversionRate: number | null;
  avgDaysPacketSentToReferral: number | null;
  topPacketMaterialsByLeads: Array<{ materialId: string; materialName: string; leads: number }>;
};

export const PACKET_DELIVERY_LABELS: Record<PacketDeliveryMethod, string> = {
  fax: "Fax",
  email: "Email",
  print_dropoff: "Print / drop-off",
  hand_delivered: "Hand delivered",
  portal_upload: "Portal upload",
  other: "Other",
};

export const PACKET_TYPE_LABELS: Record<PacketType, string> = {
  general_agency_packet: "General agency packet",
  referral_packet: "Referral packet",
  wound_care_packet: "Wound care packet",
  pediatric_packet: "Pediatric packet",
  private_pay_packet: "Private pay packet",
  credentialing_packet: "Credentialing packet",
  other: "Other",
};

export const PACKET_STATUS_LABELS: Record<PacketRequestStatus, string> = {
  pending: "Pending",
  sent: "Sent",
  confirmed_received: "Confirmed received",
  canceled: "Canceled",
  failed: "Failed",
};

export function inferDeliveryMethodFromOutcome(outcome: string | null | undefined): PacketDeliveryMethod | null {
  if (outcome === "Wants Packet Faxed") return "fax";
  if (outcome === "Wants Email Info") return "email";
  if (outcome === "Left Materials") return "hand_delivered";
  return null;
}

export function isPacketRequestSuggestedOutcome(outcome: string | null | undefined): boolean {
  return outcome === "Wants Packet Faxed" || outcome === "Wants Email Info";
}

export function shouldDefaultCreatePacketRequest(
  outcome: string | null | undefined,
  requestedPacket: boolean
): boolean {
  return requestedPacket || isPacketRequestSuggestedOutcome(outcome);
}
