/**
 * Client-side offline queue for field sales actions.
 * Metadata in localStorage; photo blobs in IndexedDB.
 */

import { deleteOfflineBlob, loadOfflineFiles, saveOfflineFiles } from "@/lib/crm/facility-offline-blob-store";

export const OFFLINE_QUEUE_EVENT = "saintly:facility-offline-queue-changed";

const QUEUE_KEY = "saintly_facility_offline_queue_v1";
const USER_KEY = "saintly_facility_offline_queue_user_id";
const LAST_SYNC_KEY = "saintly_facility_offline_last_sync_at";

export const OFFLINE_QUEUE_TYPES = [
  "quick_log",
  "photo_note",
  "ai_capture_note",
  "route_check_in",
  "route_stop_complete",
  "route_stop_skip",
  "follow_up_complete",
  "packet_mark_sent_manual",
] as const;

export type OfflineQueueItemType = (typeof OFFLINE_QUEUE_TYPES)[number];

export const OFFLINE_QUEUE_STATUSES = ["pending", "syncing", "failed", "synced", "canceled"] as const;
export type OfflineQueueItemStatus = (typeof OFFLINE_QUEUE_STATUSES)[number];

export type OfflineQueueItem = {
  local_id: string;
  user_id: string;
  type: OfflineQueueItemType;
  status: OfflineQueueItemStatus;
  payload: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  retry_count: number;
  last_error: string | null;
  related_facility_id: string | null;
  related_route_id: string | null;
  related_stop_id: string | null;
  depends_on_local_id: string | null;
  blob_key: string | null;
  facility_name: string | null;
  label: string | null;
  /** Populated after successful sync (e.g. activity_id). */
  sync_result: Record<string, unknown> | null;
};

function newLocalId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `oq-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function notifyOfflineQueueChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OFFLINE_QUEUE_EVENT));
}

export function initOfflineQueueUser(userId: string): void {
  if (typeof window === "undefined") return;
  try {
    const prev = window.localStorage.getItem(USER_KEY);
    if (prev && prev !== userId) {
      window.sessionStorage.setItem("saintly_offline_queue_user_mismatch", prev);
    }
    window.localStorage.setItem(USER_KEY, userId);
  } catch {
    // ignore
  }
}

export function getOfflineQueueUserId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(USER_KEY);
  } catch {
    return null;
  }
}

export function getLastSyncAt(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LAST_SYNC_KEY);
  } catch {
    return null;
  }
}

export function setLastSyncAt(iso: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LAST_SYNC_KEY, iso);
  } catch {
    // ignore
  }
}

function readAllRaw(): OfflineQueueItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OfflineQueueItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: OfflineQueueItem[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(items));
    notifyOfflineQueueChanged();
  } catch {
    // ignore
  }
}

export function listOfflineQueueItems(userId?: string | null): OfflineQueueItem[] {
  const uid = userId ?? getOfflineQueueUserId();
  if (!uid) return [];
  return readAllRaw()
    .filter((i) => i.user_id === uid && i.status !== "synced" && i.status !== "canceled")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function listAllOfflineQueueItems(userId?: string | null): OfflineQueueItem[] {
  const uid = userId ?? getOfflineQueueUserId();
  if (!uid) return [];
  return readAllRaw()
    .filter((i) => i.user_id === uid)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export function getOfflineQueueItem(localId: string): OfflineQueueItem | null {
  return readAllRaw().find((i) => i.local_id === localId) ?? null;
}

export function countPendingOfflineItems(userId?: string | null): number {
  return listOfflineQueueItems(userId).filter((i) => i.status === "pending" || i.status === "failed").length;
}

export type EnqueueOfflineInput = {
  type: OfflineQueueItemType;
  payload: Record<string, unknown>;
  user_id: string;
  related_facility_id?: string | null;
  related_route_id?: string | null;
  related_stop_id?: string | null;
  depends_on_local_id?: string | null;
  facility_name?: string | null;
  label?: string | null;
  photo_files?: File[];
};

export async function enqueueOfflineItem(input: EnqueueOfflineInput): Promise<OfflineQueueItem | null> {
  const local_id = newLocalId();
  let blob_key: string | null = null;

  if (input.photo_files?.length) {
    blob_key = `photo:${local_id}`;
    const saved = await saveOfflineFiles(blob_key, input.photo_files);
    if (!saved) blob_key = null;
  }

  const now = new Date().toISOString();
  const item: OfflineQueueItem = {
    local_id,
    user_id: input.user_id,
    type: input.type,
    status: "pending",
    payload: input.payload,
    created_at: now,
    updated_at: now,
    retry_count: 0,
    last_error: null,
    related_facility_id: input.related_facility_id ?? null,
    related_route_id: input.related_route_id ?? null,
    related_stop_id: input.related_stop_id ?? null,
    depends_on_local_id: input.depends_on_local_id ?? null,
    blob_key,
    facility_name: input.facility_name ?? null,
    label: input.label ?? defaultLabel(input.type, input.facility_name),
    sync_result: null,
  };

  const all = readAllRaw();
  all.push(item);
  writeAll(all);
  return item;
}

function defaultLabel(type: OfflineQueueItemType, facilityName?: string | null): string {
  const fac = facilityName ? ` · ${facilityName}` : "";
  switch (type) {
    case "quick_log":
      return `Quick Log${fac}`;
    case "photo_note":
      return `Photo Note${fac}`;
    case "ai_capture_note":
      return `AI Capture draft${fac}`;
    case "route_check_in":
      return `Check-in${fac}`;
    case "route_stop_complete":
      return `Complete stop${fac}`;
    case "route_stop_skip":
      return `Skip stop${fac}`;
    default:
      return `${type}${fac}`;
  }
}

export function updateOfflineQueueItem(
  localId: string,
  patch: Partial<Pick<OfflineQueueItem, "status" | "payload" | "last_error" | "retry_count" | "sync_result" | "label">>
): void {
  const all = readAllRaw();
  const idx = all.findIndex((i) => i.local_id === localId);
  if (idx < 0) return;
  all[idx] = { ...all[idx], ...patch, updated_at: new Date().toISOString() };
  writeAll(all);
}

export async function deleteOfflineQueueItem(localId: string): Promise<void> {
  const all = readAllRaw();
  const item = all.find((i) => i.local_id === localId);
  if (item?.blob_key) await deleteOfflineBlob(item.blob_key);
  writeAll(all.filter((i) => i.local_id !== localId));
}

export async function loadQueuedPhotoFiles(item: OfflineQueueItem): Promise<File[]> {
  if (!item.blob_key) return [];
  return loadOfflineFiles(item.blob_key);
}

export function isNetworkError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && !navigator.onLine) return true;
  if (err instanceof TypeError) return true;
  return false;
}

export function isLikelyOfflineResponse(res: Response | null): boolean {
  return res === null || res.status === 0;
}
