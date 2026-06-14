"use client";

import { useCallback, useEffect, useState } from "react";

import {
  countPendingOfflineItems,
  getLastSyncAt,
  getOfflineQueueUserId,
  listOfflineQueueItems,
  OFFLINE_QUEUE_EVENT,
  type OfflineQueueItem,
} from "@/lib/crm/facility-offline-queue";

export function useFacilityOfflineQueue(userId?: string | null) {
  const [items, setItems] = useState<OfflineQueueItem[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const uid = userId ?? getOfflineQueueUserId();
    setItems(listOfflineQueueItems(uid));
    setPendingCount(countPendingOfflineItems(uid));
    setLastSyncAt(getLastSyncAt());
  }, [userId]);

  useEffect(() => {
    refresh();
    const onChange = () => refresh();
    window.addEventListener(OFFLINE_QUEUE_EVENT, onChange);
    return () => window.removeEventListener(OFFLINE_QUEUE_EVENT, onChange);
  }, [refresh]);

  const pendingForRoute = useCallback(
    (routeId: string) => items.filter((i) => i.related_route_id === routeId).length,
    [items]
  );

  return { items, pendingCount, lastSyncAt, refresh, pendingForRoute };
}
