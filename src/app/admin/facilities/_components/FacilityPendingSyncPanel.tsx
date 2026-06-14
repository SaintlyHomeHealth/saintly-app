"use client";

import { useState } from "react";

import { FacilityPendingSyncCard } from "@/app/admin/facilities/_components/FacilityPendingSyncCard";
import { deleteOfflineQueueItem, type OfflineQueueItem } from "@/lib/crm/facility-offline-queue";

type FacilityPendingSyncPanelProps = {
  items: OfflineQueueItem[];
  onRetry: (localId: string) => void;
  onEdit: (item: OfflineQueueItem) => void;
  retryingId?: string | null;
};

export function FacilityPendingSyncPanel({ items, onRetry, onEdit, retryingId }: FacilityPendingSyncPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
        No pending items. Logs and check-ins sync automatically when you&apos;re back online.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <FacilityPendingSyncCard
          key={item.local_id}
          item={item}
          onRetry={onRetry}
          onEdit={onEdit}
          retrying={retryingId === item.local_id}
          onDelete={(id) => setConfirmDeleteId(id)}
        />
      ))}

      {confirmDeleteId ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-base font-semibold text-slate-900">Delete this pending draft?</p>
            <p className="mt-1 text-sm text-slate-600">This cannot be undone.</p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold"
                onClick={() => setConfirmDeleteId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white"
                onClick={() => {
                  void deleteOfflineQueueItem(confirmDeleteId).then(() => setConfirmDeleteId(null));
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
