"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import type { FacilityNotificationsListResponse } from "@/app/api/facilities/notifications/route";
import type { FacilityNotificationsGenerateResponse } from "@/app/api/facilities/notifications/generate/route";
import type {
  FacilityDailyAlertSummary,
  FacilityManagerAlertRow,
  FacilityNotificationRow,
  FacilityNotificationSummary,
} from "@/lib/crm/facility-notification-types";

import { useOptionalFacilityNotificationsContext } from "./FacilityNotificationsProvider";

export type FacilityNotificationsState = {
  notifications: FacilityNotificationRow[];
  summary: FacilityNotificationSummary;
  daily: FacilityDailyAlertSummary | null;
  managerAlerts: FacilityManagerAlertRow[];
  loading: boolean;
  error: string | null;
  refresh: (generate?: boolean) => Promise<void>;
  markRead: (notificationId: string) => Promise<void>;
  dismiss: (notificationId: string) => Promise<void>;
};

export function useFacilityNotificationsState(opts?: {
  autoGenerate?: boolean;
  pollMs?: number;
  /** When true, skip initial fetch/poll (used when a parent provider owns the shared state). */
  skipFetch?: boolean;
}): FacilityNotificationsState {
  const [notifications, setNotifications] = useState<FacilityNotificationRow[]>([]);
  const [summary, setSummary] = useState<FacilityNotificationSummary>({ unread: 0, urgent: 0, warnings: 0 });
  const [daily, setDaily] = useState<FacilityDailyAlertSummary | null>(null);
  const [managerAlerts, setManagerAlerts] = useState<FacilityManagerAlertRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(
    async (generate = false) => {
      setError(null);
      try {
        if (generate || opts?.autoGenerate) {
          const genRes = await fetch("/api/facilities/notifications/generate", { method: "POST" });
          const genData = (await genRes.json()) as FacilityNotificationsGenerateResponse;
          if (genData.ok) {
            setDaily(genData.daily);
            setManagerAlerts(genData.managerAlerts);
          }
        }

        const params = new URLSearchParams();
        params.set("status", "unread");
        params.set("limit", "50");
        const res = await fetch(`/api/facilities/notifications?${params.toString()}`);
        const data = (await res.json()) as FacilityNotificationsListResponse;
        if (!data.ok) {
          setError("Could not load notifications.");
          return;
        }
        setNotifications(data.notifications);
        setSummary(data.summary);
      } catch {
        setError("Network error loading notifications.");
      } finally {
        setLoading(false);
      }
    },
    [opts?.autoGenerate]
  );

  useEffect(() => {
    if (opts?.skipFetch) return;
    void refresh(true);
  }, [refresh, opts?.skipFetch]);

  useEffect(() => {
    if (opts?.skipFetch || !opts?.pollMs) return;
    const id = window.setInterval(() => void refresh(false), opts.pollMs);
    return () => window.clearInterval(id);
  }, [opts?.pollMs, refresh]);

  const markRead = useCallback(async (notificationId: string) => {
    try {
      await fetch(`/api/facilities/notifications/${notificationId}/read`, { method: "POST" });
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      setSummary((s) => ({ ...s, unread: Math.max(0, s.unread - 1) }));
    } catch {
      /* ignore */
    }
  }, []);

  const dismiss = useCallback(async (notificationId: string) => {
    try {
      await fetch(`/api/facilities/notifications/${notificationId}/dismiss`, { method: "POST" });
      setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
      setSummary((s) => ({ ...s, unread: Math.max(0, s.unread - 1) }));
    } catch {
      /* ignore */
    }
  }, []);

  return {
    notifications,
    summary,
    daily,
    managerAlerts,
    loading,
    error,
    refresh,
    markRead,
    dismiss,
  };
}

/** Uses shared provider state on facility hub pages; falls back to a local instance elsewhere. */
export function useFacilityNotifications(opts?: { autoGenerate?: boolean; pollMs?: number }) {
  const shared = useOptionalFacilityNotificationsContext();
  const local = useFacilityNotificationsState({
    ...opts,
    skipFetch: Boolean(shared),
  });
  return shared ?? local;
}

export function FacilityNotificationEmptyState() {
  return (
    <p className="px-4 py-6 text-center text-sm text-slate-500">No notifications — you&apos;re all caught up.</p>
  );
}

export type FacilityNotificationActionsProps = {
  notification: FacilityNotificationRow;
  onRead: (id: string) => void;
  onDismiss: (id: string) => void;
  compact?: boolean;
};

export function FacilityNotificationActions({
  notification,
  onRead,
  onDismiss,
  compact,
}: FacilityNotificationActionsProps) {
  const btnCls = compact
    ? "rounded-lg px-2 py-1 text-[10px] font-semibold"
    : "rounded-lg px-2.5 py-1.5 text-xs font-semibold";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {notification.action_url ? (
        <Link
          href={notification.action_url}
          onClick={() => onRead(notification.id)}
          className={`${btnCls} border border-sky-600 bg-sky-600 text-white hover:bg-sky-700`}
        >
          Open
        </Link>
      ) : null}
      {notification.status === "unread" ? (
        <button
          type="button"
          onClick={() => onRead(notification.id)}
          className={`${btnCls} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
        >
          Mark read
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => onDismiss(notification.id)}
        className={`${btnCls} border border-slate-200 bg-white text-slate-500 hover:bg-slate-50`}
      >
        Dismiss
      </button>
    </div>
  );
}
