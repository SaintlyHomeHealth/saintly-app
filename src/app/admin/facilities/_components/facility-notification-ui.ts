import type { FacilityNotificationSeverity, FacilityNotificationType } from "@/lib/crm/facility-notification-types";

export function facilityNotificationSeverityClass(severity: FacilityNotificationSeverity): string {
  switch (severity) {
    case "urgent":
      return "border-rose-300 bg-rose-50 text-rose-950";
    case "warning":
      return "border-amber-300 bg-amber-50 text-amber-950";
    case "success":
      return "border-emerald-300 bg-emerald-50 text-emerald-950";
    default:
      return "border-sky-200 bg-sky-50 text-sky-950";
  }
}

export function facilityNotificationIcon(severity: FacilityNotificationSeverity): string {
  switch (severity) {
    case "urgent":
      return "⚠";
    case "warning":
      return "!";
    case "success":
      return "✓";
    default:
      return "•";
  }
}

export function facilityNotificationTypeLabel(type: FacilityNotificationType): string {
  switch (type) {
    case "facility_follow_up_due":
      return "Due today";
    case "facility_follow_up_overdue":
      return "Overdue";
    case "facility_referral_created":
      return "New referral";
    case "facility_referral_stuck":
      return "Stuck";
    case "facility_referral_waiting_orders":
      return "Waiting orders";
    case "facility_referral_converted":
      return "Converted";
    case "facility_referral_lost":
      return "Lost";
    case "facility_route_unfinished":
      return "Route";
    case "facility_warm_source_needs_follow_up":
      return "Warm source";
    case "facility_rep_inactive":
      return "Rep inactive";
    case "facility_photo_review_pending":
      return "Photo review";
    case "facility_task_assigned":
      return "Task assigned";
    case "facility_campaign_step_due":
      return "Campaign step due";
    case "facility_campaign_step_overdue":
      return "Campaign overdue";
    case "facility_campaign_enrolled":
      return "Campaign enrolled";
    case "facility_campaign_completed":
      return "Campaign done";
    default:
      return "Alert";
  }
}

export function formatNotificationTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
