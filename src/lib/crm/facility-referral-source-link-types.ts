export type ReferralSourceLinkType =
  | "universal"
  | "facility"
  | "contact"
  | "campaign"
  | "packet"
  | "material"
  | "route"
  | "activity"
  | "rep"
  | "custom";

export type ReferralSourceLinkStatus = "active" | "inactive" | "archived";

export type FacilityReferralSourceLinkRow = {
  id: string;
  token: string | null;
  short_slug: string | null;
  facility_id: string | null;
  contact_id: string | null;
  campaign_id: string | null;
  campaign_enrollment_id: string | null;
  packet_request_id: string | null;
  packet_material_id: string | null;
  route_plan_id: string | null;
  route_stop_id: string | null;
  activity_id: string | null;
  sales_rep_id: string | null;
  link_type: ReferralSourceLinkType;
  label: string | null;
  destination_url: string | null;
  material_type: string | null;
  default_source: string | null;
  status: ReferralSourceLinkStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  use_count: number;
  metadata: Record<string, unknown> | null;
  facility_name?: string | null;
  campaign_name?: string | null;
  sales_rep_label?: string | null;
  view_count?: number;
  submission_count?: number;
  leads_created_count?: number;
  packet_request_label?: string | null;
  packet_material_name?: string | null;
  packet_delivery_method?: string | null;
};

export type CreateSourceLinkInput = {
  link_type: ReferralSourceLinkType;
  label: string;
  campaign_id?: string | null;
  sales_rep_id?: string | null;
  facility_id?: string | null;
  contact_id?: string | null;
  material_type?: string | null;
  default_source?: string | null;
  short_slug?: string | null;
  status?: ReferralSourceLinkStatus;
};

export type ResolveSourceLinkInput = {
  link_type: ReferralSourceLinkType;
  facility_id?: string | null;
  campaign_id?: string | null;
  sales_rep_id?: string | null;
  label?: string | null;
  material_type?: string | null;
  create_if_missing?: boolean;
};

export type SourceLinkEventRow = {
  id: string;
  event_type: string;
  created_at: string;
  lead_id: string | null;
  facility_id: string | null;
  metadata: Record<string, unknown> | null;
};
