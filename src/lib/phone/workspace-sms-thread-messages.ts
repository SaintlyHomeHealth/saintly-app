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
};

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
    (a.phone_call_id ?? null) === (b.phone_call_id ?? null)
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
  const byId = new Map<string, WorkspaceSmsThreadMessage>();
  for (const m of prev) {
    byId.set(m.id, m);
  }
  for (const m of incoming) {
    const old = byId.get(m.id);
    if (old && sameWorkspaceSmsThreadMessage(old, m)) {
      continue;
    }
    byId.set(m.id, m);
  }
  return sortThreadMessages([...byId.values()]);
}
