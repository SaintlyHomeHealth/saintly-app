export const FOLLOW_UP_TASK_STATUSES = ["open", "completed", "snoozed", "canceled"] as const;
export type FollowUpTaskStatus = (typeof FOLLOW_UP_TASK_STATUSES)[number];

export const FOLLOW_UP_TASK_PRIORITIES = ["Low", "Normal", "High"] as const;
export type FollowUpTaskPriority = (typeof FOLLOW_UP_TASK_PRIORITIES)[number];

export const FOLLOW_UP_TASK_SOURCES = [
  "quick_log",
  "ai_capture",
  "manual",
  "photo_note",
  "advanced_log",
  "facility_referral",
  "campaign",
  "packet",
] as const;
export type FollowUpTaskSource = (typeof FOLLOW_UP_TASK_SOURCES)[number];

export type FollowUpTaskRow = {
  id: string;
  facility_id: string;
  activity_id: string | null;
  contact_id: string | null;
  assigned_to: string | null;
  title: string;
  description: string | null;
  due_at: string;
  status: FollowUpTaskStatus;
  priority: FollowUpTaskPriority | null;
  source: FollowUpTaskSource | null;
  completed_at: string | null;
  completed_by: string | null;
  completion_note: string | null;
  snoozed_until: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  campaign_id?: string | null;
  campaign_enrollment_id?: string | null;
  campaign_step_instance_id?: string | null;
};

export type FollowUpTaskCard = FollowUpTaskRow & {
  facility_name: string;
  facility_city: string | null;
  facility_type: string | null;
  facility_phone: string | null;
  facility_address: string;
  facility_latitude: number | null;
  facility_longitude: number | null;
  contact_name: string | null;
  assigned_to_label: string | null;
  is_overdue: boolean;
  is_due_today: boolean;
  effective_due_at: string;
  campaign_id?: string | null;
  campaign_name?: string | null;
  campaign_step_number?: number | null;
  campaign_total_steps?: number | null;
};

export type FollowUpTaskSummary = {
  overdue: number;
  due_today: number;
  upcoming: number;
  completed_this_week: number;
};

export const FOLLOW_UP_SOURCE_LABELS: Record<FollowUpTaskSource, string> = {
  quick_log: "Quick Log",
  ai_capture: "AI Capture",
  manual: "Manual",
  photo_note: "Photo Note",
  advanced_log: "Advanced Log",
  facility_referral: "Facility Referral",
  campaign: "Campaign",
  packet: "Packet follow-up",
};
