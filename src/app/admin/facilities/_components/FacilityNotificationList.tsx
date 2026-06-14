"use client";

import type { FacilityNotificationRow } from "@/lib/crm/facility-notification-types";

import { FacilityNotificationCard } from "@/app/admin/facilities/_components/FacilityNotificationCard";
import { FacilityNotificationEmptyState } from "@/app/admin/facilities/_components/useFacilityNotifications";

type FacilityNotificationListProps = {
  notifications: FacilityNotificationRow[];
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  compact?: boolean;
  maxItems?: number;
};

export function FacilityNotificationList({
  notifications,
  onRead,
  onDismiss,
  compact,
  maxItems,
}: FacilityNotificationListProps) {
  const items = maxItems ? notifications.slice(0, maxItems) : notifications;

  if (items.length === 0) return <FacilityNotificationEmptyState />;

  return (
    <ul className="space-y-2">
      {items.map((n) => (
        <li key={n.id}>
          <FacilityNotificationCard
            notification={n}
            onRead={onRead}
            onDismiss={onDismiss}
            compact={compact}
          />
        </li>
      ))}
    </ul>
  );
}
