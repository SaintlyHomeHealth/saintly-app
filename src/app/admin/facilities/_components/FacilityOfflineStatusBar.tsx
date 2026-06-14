"use client";

import { useFacilityOnlineStatus } from "@/app/admin/facilities/_components/useFacilityOnlineStatus";

type FacilityOfflineStatusBarProps = {
  pendingCount: number;
  lastSyncAt: string | null;
  syncing?: boolean;
  onSyncNow?: () => void;
  showBackOnlinePrompt?: boolean;
  onDismissBackOnline?: () => void;
};

function formatLastSync(iso: string | null): string {
  if (!iso) return "Never";
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "—";
  }
}

export function FacilityOfflineStatusBar({
  pendingCount,
  lastSyncAt,
  syncing = false,
  onSyncNow,
  showBackOnlinePrompt = false,
  onDismissBackOnline,
}: FacilityOfflineStatusBarProps) {
  const { isOnline, isOffline, isChecking } = useFacilityOnlineStatus();

  const statusLabel = syncing ? "Syncing" : isChecking ? "Checking…" : isOnline ? "Online" : "Offline";
  const statusCls = syncing
    ? "bg-sky-100 text-sky-900 ring-sky-200"
    : isOnline
      ? "bg-emerald-100 text-emerald-900 ring-emerald-200"
      : "bg-amber-100 text-amber-950 ring-amber-200";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-full px-2.5 py-1 font-bold ring-1 ${statusCls}`}>{statusLabel}</span>
          {pendingCount > 0 ? (
            <span className="rounded-full bg-violet-100 px-2.5 py-1 font-semibold text-violet-900 ring-1 ring-violet-200">
              Pending sync: {pendingCount}
            </span>
          ) : null}
          <span className="text-slate-500">Last synced: {formatLastSync(lastSyncAt)}</span>
        </div>
        {onSyncNow && pendingCount > 0 && isOnline && !syncing ? (
          <button
            type="button"
            onClick={onSyncNow}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Sync Now
          </button>
        ) : null}
      </div>

      {isOffline ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          You&apos;re offline. New logs and photos will be saved as drafts and synced later.
        </div>
      ) : null}

      {showBackOnlinePrompt && isOnline && pendingCount > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-950">
          <span>Back online. Sync pending items?</span>
          <div className="flex gap-2">
            <button type="button" className="text-xs font-semibold underline" onClick={onDismissBackOnline}>
              Later
            </button>
            {onSyncNow ? (
              <button
                type="button"
                className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white"
                onClick={onSyncNow}
              >
                Sync Now
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
