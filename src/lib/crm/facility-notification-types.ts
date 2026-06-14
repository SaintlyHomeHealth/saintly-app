export const FACILITY_NOTIFICATION_TYPES = [
  "facility_follow_up_due",
  "facility_follow_up_overdue",
  "facility_referral_created",
  "facility_referral_stuck",
  "facility_referral_waiting_orders",
  "facility_referral_converted",
  "facility_referral_lost",
  "facility_route_unfinished",
  "facility_route_assigned",
  "facility_route_started",
  "facility_route_completed",
  "facility_route_stop_overdue",
  "facility_warm_source_needs_follow_up",
  "facility_rep_inactive",
  "facility_photo_review_pending",
  "facility_task_assigned",
  "facility_campaign_step_due",
  "facility_campaign_step_overdue",
  "facility_campaign_enrolled",
  "facility_campaign_completed",
  "facility_packet_request_created",
  "facility_packet_request_due",
  "facility_packet_request_overdue",
  "facility_packet_sent",
  "facility_packet_send_failed",
  "facility_packet_confirm_received",
  "facility_offline_sync_failed",
  "facility_pending_sync_items",
  "facility_profile_needs_update",
  "facility_next_best_action_due",
  "facility_referral_process_missing",
  "facility_referral_source_review_needed",
  "facility_referral_source_review_completed",
  "facility_qr_referral_submitted",
  "lead_referral_documents_uploaded",
  "lead_referral_document_review_needed",
  "lead_referral_document_upload_failed",
  "lead_referral_document_rejected",
  "lead_document_ai_review_ready",
  "lead_document_ai_review_failed",
  "lead_intake_missing_required_documents",
  "lead_intake_ready",
  "lead_intake_needs_info",
  "lead_intake_clinical_review_needed",
  "lead_intake_accepted",
  "lead_intake_declined",
  "lead_intake_review_overdue",
  "lead_admission_handoff_created",
  "lead_admission_ready_for_soc",
  "lead_admission_missing_items",
  "lead_admission_soc_scheduled",
  "lead_admission_alora_entered",
  "lead_admission_admitted",
  "lead_admission_on_hold",
] as const;

export type FacilityNotificationType = (typeof FACILITY_NOTIFICATION_TYPES)[number];

export type FacilityNotificationSeverity = "info" | "success" | "warning" | "urgent";

export type FacilityNotificationStatus = "unread" | "read" | "dismissed";

export type FacilityNotificationRow = {
  id: string;
  user_id: string;
  facility_id: string | null;
  lead_id: string | null;
  task_id: string | null;
  activity_id: string | null;
  notification_type: FacilityNotificationType;
  title: string;
  message: string | null;
  severity: FacilityNotificationSeverity;
  status: FacilityNotificationStatus;
  action_url: string | null;
  metadata: Record<string, unknown> | null;
  dedupe_key: string | null;
  created_at: string;
  read_at: string | null;
  dismissed_at: string | null;
};

export type FacilityNotificationSummary = {
  unread: number;
  urgent: number;
  warnings: number;
};

export type FacilityDailyAlertSummary = {
  followUpsDueToday: number;
  followUpsOverdue: number;
  referralsWaitingOrders: number;
  referralsStuck: number;
  warmSourcesNeedFollowUp: number;
  newReferrals: number;
  routeUnfinishedCount: number;
};

export type FacilityManagerAlertRow = {
  key: string;
  title: string;
  message: string;
  severity: FacilityNotificationSeverity;
  action_url: string | null;
  count: number;
};
