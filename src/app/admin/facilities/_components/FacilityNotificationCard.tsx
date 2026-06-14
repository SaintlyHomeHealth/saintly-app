"use client";

import type { FacilityNotificationRow } from "@/lib/crm/facility-notification-types";

import {
  FacilityNotificationActions,
} from "@/app/admin/facilities/_components/useFacilityNotifications";
import {
  facilityNotificationIcon,
  facilityNotificationSeverityClass,
  facilityNotificationTypeLabel,
  formatNotificationTime,
} from "@/app/admin/facilities/_components/facility-notification-ui";

type FacilityNotificationCardProps = {
  notification: FacilityNotificationRow;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  compact?: boolean;
};

export function FacilityNotificationCard({
  notification,
  onRead,
  onDismiss,
  compact,
}: FacilityNotificationCardProps) {
  const severityCls = facilityNotificationSeverityClass(notification.severity);
  const facilityName =
    typeof notification.metadata?.facility_name === "string"
      ? notification.metadata.facility_name
      : null;

  return (
    <article
      className={`rounded-xl border p-3 shadow-sm ${severityCls} ${notification.status === "unread" ? "ring-1 ring-inset ring-black/5" : "opacity-90"}`}
    >
      <div className="flex items-start gap-2">
        <span
          className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/70 text-xs font-bold"
          aria-hidden
        >
          {facilityNotificationIcon(notification.severity)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
              {facilityNotificationTypeLabel(notification.notification_type)}
            </span>
            <time className="text-[10px] font-medium opacity-70">{formatNotificationTime(notification.created_at)}</time>
          </div>
          <h4 className={`mt-1 font-semibold ${compact ? "text-sm" : "text-base"}`}>{notification.title}</h4>
          {notification.message ? (
            <p className={`mt-1 ${compact ? "text-xs" : "text-sm"} opacity-90`}>{notification.message}</p>
          ) : null}
          {facilityName ? (
            <p className="mt-1 text-xs font-medium opacity-80">{facilityName}</p>
          ) : null}
          <div className="mt-2">
            <FacilityNotificationActions
              notification={notification}
              onRead={onRead}
              onDismiss={onDismiss}
              compact={compact}
            />
          </div>
        </div>
      </div>
    </article>
  );
}
