/**
 * IndexedDB blob store for offline photo queue items.
 * Avoids base64 in localStorage for large files.
 */

const DB_NAME = "saintly_facility_offline_v1";
const STORE_NAME = "photo_blobs";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("indexeddb_unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("idb_open_failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export async function saveOfflineBlob(key: string, blob: Blob): Promise<boolean> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(blob, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
    return true;
  } catch {
    return false;
  }
}

export async function loadOfflineBlob(key: string): Promise<Blob | null> {
  try {
    const db = await openDb();
    const blob = await new Promise<Blob | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result as Blob | undefined);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return blob ?? null;
  } catch {
    return null;
  }
}

export async function deleteOfflineBlob(key: string): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // ignore
  }
}

export async function saveOfflineFiles(key: string, files: File[]): Promise<boolean> {
  try {
    const payload = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        type: f.type,
        data: await f.arrayBuffer(),
      }))
    );
    const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
    return saveOfflineBlob(key, blob);
  } catch {
    return false;
  }
}

export async function loadOfflineFiles(key: string): Promise<File[]> {
  const blob = await loadOfflineBlob(key);
  if (!blob) return [];
  try {
    const text = await blob.text();
    const parsed = JSON.parse(text) as Array<{ name: string; type: string; data: ArrayBuffer }>;
    return parsed.map((p) => new File([p.data], p.name, { type: p.type || "image/jpeg" }));
  } catch {
    return [];
  }
}
