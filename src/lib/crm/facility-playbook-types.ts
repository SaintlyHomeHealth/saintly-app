export const PLAYBOOK_STATUSES = ["active", "inactive", "archived"] as const;
export type PlaybookStatus = (typeof PLAYBOOK_STATUSES)[number];

export const CAMPAIGN_STATUSES = ["draft", "active", "paused", "completed", "archived"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const ENROLLMENT_STATUSES = ["active", "completed", "paused", "removed"] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const STEP_INSTANCE_STATUSES = ["open", "completed", "skipped", "canceled"] as const;
export type StepInstanceStatus = (typeof STEP_INSTANCE_STATUSES)[number];

export type PlaybookStepRow = {
  id: string;
  playbook_id: string;
  step_number: number;
  title: string;
  description: string | null;
  due_offset_days: number;
  suggested_activity_type: string | null;
  suggested_outcome: string | null;
  suggested_follow_up_task: string | null;
  requires_photo: boolean;
  requires_contact_capture: boolean;
  requires_referral_process_capture: boolean;
  created_at: string;
};

export type PlaybookRow = {
  id: string;
  name: string;
  description: string | null;
  facility_type: string | null;
  specialty_tags: string[] | null;
  status: PlaybookStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type PlaybookCard = PlaybookRow & {
  step_count: number;
  active_campaign_count: number;
  steps?: PlaybookStepRow[];
};

export type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  playbook_id: string | null;
  assigned_rep_id: string | null;
  status: CampaignStatus;
  start_date: string;
  end_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignCard = CampaignRow & {
  playbook_name: string | null;
  assigned_rep_label: string | null;
  facilities_enrolled: number;
  steps_completed: number;
  steps_overdue: number;
  steps_open: number;
  referrals_generated: number;
  converted_referrals: number;
  progress_pct: number;
};

export type CampaignEnrollmentSummaryStats = {
  total_enrolled: number;
  active: number;
  completed: number;
  paused: number;
  removed: number;
  not_started: number;
  steps_due_today: number;
  steps_overdue: number;
  referrals_generated: number;
  converted_referrals: number;
};

export type CampaignDetail = CampaignCard & {
  enrollments: CampaignEnrollmentCard[];
  due_steps: CampaignStepCard[];
  overdue_steps: CampaignStepCard[];
  enrollment_summary: CampaignEnrollmentSummaryStats;
};

export type CampaignEnrollmentCard = {
  id: string;
  campaign_id: string;
  facility_id: string;
  facility_name: string;
  facility_city: string | null;
  facility_type: string | null;
  assigned_rep_id: string | null;
  assigned_rep_label: string | null;
  status: EnrollmentStatus;
  current_step_number: number;
  total_steps: number;
  next_task_id: string | null;
  enrolled_at: string;
  completed_at: string | null;
  referral_count: number;
  has_overdue_step: boolean;
};

export type CampaignStepCard = {
  id: string;
  enrollment_id: string;
  campaign_id: string;
  campaign_name: string;
  facility_id: string;
  facility_name: string;
  facility_address: string;
  facility_latitude: number | null;
  facility_longitude: number | null;
  step_number: number;
  total_steps: number;
  title: string;
  description: string | null;
  due_at: string;
  status: StepInstanceStatus;
  linked_task_id: string | null;
  suggested_activity_type: string | null;
  suggested_outcome: string | null;
  is_overdue: boolean;
  is_due_today: boolean;
};

export type FacilityEnrollmentSummary = {
  enrollment_id: string;
  campaign_id: string;
  campaign_name: string;
  status: EnrollmentStatus;
  current_step_number: number;
  total_steps: number;
  current_step_title: string | null;
  next_due_at: string | null;
  next_task_id: string | null;
  progress_pct: number;
};

export type CampaignAnalyticsRow = {
  campaign_id: string;
  campaign_name: string;
  playbook_name: string | null;
  rep_label: string | null;
  facilities_enrolled: number;
  progress_pct: number;
  steps_completed: number;
  steps_overdue: number;
  activities_generated: number;
  follow_ups_completed: number;
  referrals_created: number;
  converted_patients: number;
  last_activity_at: string | null;
};

export type CampaignAnalyticsSummary = {
  active_campaigns: number;
  facilities_enrolled: number;
  steps_completed: number;
  steps_overdue: number;
  referrals_generated: number;
  converted_referrals: number;
  best_campaign_name: string | null;
  conversion_rate_pct: number | null;
  campaigns: CampaignAnalyticsRow[];
};

export type CampaignCandidateFilters = {
  search?: string;
  city?: string;
  facility_type?: string;
  specialty?: string;
  priority?: string;
  assigned_rep_id?: string;
  relationship_status?: string;
  source?: string;
  last_visit?: string;
  not_visited?: boolean | string;
  follow_up_status?: string;
  referral_potential?: string;
  has_referrals?: string;
  enrollment_status?: string;
  no_active_campaign?: boolean | string;
  limit?: number;
  offset?: number;
};

export type CampaignCandidateFacility = {
  id: string;
  name: string;
  type: string | null;
  city: string | null;
  address: string;
  main_phone: string | null;
  priority: string;
  status: string;
  source: string | null;
  specialty_tags: string[] | null;
  last_visit_at: string | null;
  next_follow_up_at: string | null;
  relationship_strength: number | null;
  visit_frequency: string | null;
  assigned_rep_user_id: string | null;
  assigned_rep_label: string | null;
  referral_count: number;
  referral_potential: string | null;
  is_warm: boolean;
  follow_up_status: "due" | "overdue" | "upcoming" | null;
  enrollment_status: "not_enrolled" | "enrolled_this" | "enrolled_other";
  other_campaign_name: string | null;
};

export type CampaignCandidateSummary = {
  not_enrolled: number;
  already_enrolled: number;
  selected_possible: number;
};

export type BulkEnrollResult = {
  ok: true;
  enrolled_count: number;
  skipped_existing_count: number;
  enrolled: string[];
  skipped: string[];
  failed: Array<{ facility_id: string; error: string }>;
};

export type FacilitySegmentRow = {
  id: string;
  name: string;
  description: string | null;
  filters_json: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type CampaignQuickLogContext = {
  step_instance_id: string;
  enrollment_id: string;
  campaign_id: string;
  campaign_name: string;
  step_number: number;
  total_steps: number;
  step_title: string;
  suggested_activity_type: string | null;
  suggested_outcome: string | null;
  requires_photo: boolean;
  requires_referral_process_capture: boolean;
};
