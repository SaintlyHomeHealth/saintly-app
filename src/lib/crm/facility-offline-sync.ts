import {
  getOfflineQueueItem,
  listOfflineQueueItems,
  loadQueuedPhotoFiles,
  setLastSyncAt,
  updateOfflineQueueItem,
  type OfflineQueueItem,
} from "@/lib/crm/facility-offline-queue";
import { uploadFacilityPhotoFiles } from "@/lib/crm/facility-photo-client";

export type SyncProgress = {
  syncing: boolean;
  processed: number;
  total: number;
  lastError: string | null;
};

const MAX_AUTO_RETRIES = 5;

async function syncQuickLog(item: OfflineQueueItem): Promise<Record<string, unknown>> {
  const facilityId = item.related_facility_id ?? String(item.payload.facility_id ?? "");
  if (!facilityId) throw new Error("Missing facility.");

  const res = await fetch(`/api/facilities/${facilityId}/quick-log`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item.payload),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; activity?: { id?: string } };
  if (!data.ok) throw new Error(data.error ?? "Quick Log sync failed.");
  const activityId = data.activity?.id ?? null;

  if (item.blob_key && activityId) {
    const files = await loadQueuedPhotoFiles(item);
    if (files.length > 0) {
      await uploadFacilityPhotoFiles({ facilityId, activityId, files });
    }
  }

  return { activity_id: activityId };
}

async function syncPhotoNote(item: OfflineQueueItem): Promise<Record<string, unknown>> {
  const facilityId = item.related_facility_id ?? String(item.payload.facility_id ?? "");
  if (!facilityId) throw new Error("Missing facility.");

  const files = await loadQueuedPhotoFiles(item);
  if (!files.length) {
    throw new Error("Photo files missing from offline storage.");
  }

  const uploaded = await uploadFacilityPhotoFiles({ facilityId, files });
  if (!uploaded.ok) throw new Error(uploaded.error ?? "Photo upload failed.");
  return { photo_ids: uploaded.photos.map((p) => p.id) };
}

async function syncRouteCheckIn(item: OfflineQueueItem): Promise<Record<string, unknown>> {
  const routeId = item.related_route_id;
  const stopId = item.related_stop_id;
  if (!routeId || !stopId) throw new Error("Missing route stop.");

  const res = await fetch(`/api/facilities/routes/${routeId}/stops/${stopId}/check-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item.payload),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(data.error ?? "Check-in sync failed.");
  return {};
}

async function syncRouteStopComplete(item: OfflineQueueItem): Promise<Record<string, unknown>> {
  const routeId = item.related_route_id;
  const stopId = item.related_stop_id;
  if (!routeId || !stopId) throw new Error("Missing route stop.");

  let linked_activity_id = item.payload.linked_activity_id as string | null | undefined;
  if (item.depends_on_local_id) {
    const parent = getOfflineQueueItem(item.depends_on_local_id);
    linked_activity_id =
      (parent?.sync_result?.activity_id as string | undefined) ?? linked_activity_id ?? null;
  }

  const res = await fetch(`/api/facilities/routes/${routeId}/stops/${stopId}/complete`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...item.payload, linked_activity_id }),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(data.error ?? "Complete stop sync failed.");
  return {};
}

async function syncRouteStopSkip(item: OfflineQueueItem): Promise<Record<string, unknown>> {
  const routeId = item.related_route_id;
  const stopId = item.related_stop_id;
  if (!routeId || !stopId) throw new Error("Missing route stop.");

  const res = await fetch(`/api/facilities/routes/${routeId}/stops/${stopId}/skip`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item.payload),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string };
  if (!data.ok) throw new Error(data.error ?? "Skip stop sync failed.");
  return {};
}

async function syncAiCaptureNote(item: OfflineQueueItem): Promise<Record<string, unknown>> {
  const res = await fetch("/api/facilities/ai-capture", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(item.payload),
  });
  const data = (await res.json()) as { ok?: boolean; error?: string; draft?: unknown };
  if (!data.ok) throw new Error(data.error ?? "AI analysis failed.");
  return { draft: data.draft ?? null, needs_confirm: true };
}

async function syncOneItem(item: OfflineQueueItem): Promise<void> {
  if (item.depends_on_local_id) {
    const parent = getOfflineQueueItem(item.depends_on_local_id);
    if (!parent || parent.status !== "synced") {
      throw new Error("Waiting for linked draft to sync first.");
    }
  }

  updateOfflineQueueItem(item.local_id, { status: "syncing", last_error: null });

  let result: Record<string, unknown> = {};
  switch (item.type) {
    case "quick_log":
      result = await syncQuickLog(item);
      break;
    case "photo_note":
      result = await syncPhotoNote(item);
      break;
    case "route_check_in":
      result = await syncRouteCheckIn(item);
      break;
    case "route_stop_complete":
      result = await syncRouteStopComplete(item);
      break;
    case "route_stop_skip":
      result = await syncRouteStopSkip(item);
      break;
    case "ai_capture_note":
      result = await syncAiCaptureNote(item);
      break;
    default:
      throw new Error(`Sync not implemented for ${item.type}`);
  }

  updateOfflineQueueItem(item.local_id, { status: "synced", sync_result: result, last_error: null });

  if (item.type === "quick_log" && item.related_route_id && item.related_stop_id) {
    const activityId = result.activity_id as string | null;
    if (activityId) {
      await fetch(
        `/api/facilities/routes/${item.related_route_id}/stops/${item.related_stop_id}/complete`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linked_activity_id: activityId }),
        }
      ).catch(() => undefined);
    }
  }
}

function orderForSync(items: OfflineQueueItem[]): OfflineQueueItem[] {
  const pending = items.filter(
    (i) =>
      (i.status === "pending" || i.status === "failed") &&
      i.type !== "ai_capture_note"
  );
  const sorted: OfflineQueueItem[] = [];
  const added = new Set<string>();

  function addItem(item: OfflineQueueItem) {
    if (added.has(item.local_id)) return;
    if (item.depends_on_local_id) {
      const parent = pending.find((p) => p.local_id === item.depends_on_local_id);
      if (parent) addItem(parent);
    }
    sorted.push(item);
    added.add(item.local_id);
  }

  for (const item of pending) addItem(item);
  return sorted;
}

export async function syncOfflineQueue(userId: string): Promise<SyncProgress> {
  const items = orderForSync(listOfflineQueueItems(userId));
  const progress: SyncProgress = { syncing: true, processed: 0, total: items.length, lastError: null };

  for (const item of items) {
    try {
      await syncOneItem(item);
      progress.processed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Sync failed.";
      updateOfflineQueueItem(item.local_id, {
        status: "failed",
        last_error: message,
        retry_count: item.retry_count + 1,
      });
      progress.lastError = message;
      if (item.retry_count + 1 >= MAX_AUTO_RETRIES) {
        await notifySyncFailed(item, message);
      }
    }
  }

  progress.syncing = false;
  setLastSyncAt(new Date().toISOString());
  return progress;
}

export async function retryOfflineQueueItem(localId: string): Promise<void> {
  const item = getOfflineQueueItem(localId);
  if (!item) return;
  updateOfflineQueueItem(localId, { status: "pending", last_error: null });
  await syncOneItem({ ...item, status: "pending" });
}

async function notifySyncFailed(item: OfflineQueueItem, message: string): Promise<void> {
  try {
    await fetch("/api/facilities/offline-sync/notify-failed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        local_id: item.local_id,
        type: item.type,
        message,
        facility_name: item.facility_name,
      }),
    });
  } catch {
    // ignore
  }
}
