/**
 * Pure helpers for workspace SMS thread state merging (client-only consumers).
 * Preserves object identity for unchanged messages so memoized rows skip re-renders.
 */

export type WorkspaceSmsThreadMessage = {
  id: string;
  created_at: string | null;
  direction: string;
  body: string | null;
  message_type?: string | null;
  phone_call_id?: string | null;
  fax?: WorkspaceSmsThreadFax | null;
  /**
   * Lowercase Twilio/provider status (e.g. from `metadata.twilio_delivery.status`).
   * Omitted for inbound; used only for outbound delivery label.
   */
  outbound_status_raw?: string | null;
};

export type WorkspaceSmsThreadFax = {
  fax_id: string | null;
  telnyx_fax_id: string | null;
  media_url: string | null;
  storage_path: string | null;
};

export const WORKSPACE_SMS_THREAD_INITIAL_MESSAGE_LIMIT = 50;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function readWorkspaceSmsThreadFax(metadata: unknown): WorkspaceSmsThreadFax | null {
  const meta = asRecord(metadata);
  const fax = asRecord(meta.fax ?? meta);
  const result = {
    fax_id: readString(fax.fax_id),
    telnyx_fax_id: readString(fax.telnyx_fax_id),
    media_url: readString(fax.media_url),
    storage_path: readString(fax.storage_path),
  };
  return result.fax_id || result.telnyx_fax_id || result.media_url || result.storage_path ? result : null;
}

function sameFax(a: WorkspaceSmsThreadFax | null | undefined, b: WorkspaceSmsThreadFax | null | undefined): boolean {
  return (
    (a?.fax_id ?? null) === (b?.fax_id ?? null) &&
    (a?.telnyx_fax_id ?? null) === (b?.telnyx_fax_id ?? null) &&
    (a?.media_url ?? null) === (b?.media_url ?? null) &&
    (a?.storage_path ?? null) === (b?.storage_path ?? null)
  );
}

export function sameWorkspaceSmsThreadMessage(
  a: WorkspaceSmsThreadMessage,
  b: WorkspaceSmsThreadMessage
): boolean {
  return (
    a.id === b.id &&
    a.created_at === b.created_at &&
    a.direction === b.direction &&
    a.body === b.body &&
    (a.message_type ?? null) === (b.message_type ?? null) &&
    (a.phone_call_id ?? null) === (b.phone_call_id ?? null) &&
    sameFax(a.fax, b.fax) &&
    (a.outbound_status_raw ?? null) === (b.outbound_status_raw ?? null)
  );
}

function sortThreadMessages(rows: WorkspaceSmsThreadMessage[]): WorkspaceSmsThreadMessage[] {
  return [...rows].sort((a, b) =>
    String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""))
  );
}

/** Merge by id, preserving previous object references when payload is unchanged. */
export function mergeThreadById(
  prev: WorkspaceSmsThreadMessage[],
  incoming: WorkspaceSmsThreadMessage[]
): WorkspaceSmsThreadMessage[] {
  if (incoming.length === 0) return prev;
  const byId = new Map<string, WorkspaceSmsThreadMessage>();
  for (const m of prev) {
    byId.set(m.id, m);
  }
  let changed = false;
  for (const m of incoming) {
    const old = byId.get(m.id);
    if (old && sameWorkspaceSmsThreadMessage(old, m)) {
      continue;
    }
    changed = true;
    byId.set(m.id, m);
  }
  if (!changed) return prev;
  return sortThreadMessages([...byId.values()]);
}
