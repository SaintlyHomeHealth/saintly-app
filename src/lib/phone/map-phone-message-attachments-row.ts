import type { WorkspaceSmsThreadAttachment } from "@/lib/phone/workspace-sms-thread-messages";

/** Maps Supabase PostgREST nested `phone_message_attachments` arrays for SMS thread payloads. */
export function mapNestedPhoneAttachmentsFromRpcRow(raw: unknown): WorkspaceSmsThreadAttachment[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const out: WorkspaceSmsThreadAttachment[] = [];
  for (const r of raw) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const id = typeof o.id === "string" ? o.id.trim() : "";
    if (!id) continue;
    const ct = typeof o.content_type === "string" ? o.content_type.trim() : null;
    const fn = typeof o.file_name === "string" ? o.file_name.trim() : null;
    const idxRaw = o.provider_media_index;
    const idx =
      typeof idxRaw === "number" && Number.isFinite(idxRaw)
        ? idxRaw
        : typeof idxRaw === "string" && /^\d+$/.test(idxRaw.trim())
          ? Number.parseInt(idxRaw.trim(), 10)
          : null;
    out.push({
      id,
      content_type: ct ?? null,
      file_name: fn ?? null,
      provider_media_index: idx,
    });
  }
  if (out.length === 0) return undefined;
  return out.sort((a, b) => {
    const ai = typeof a.provider_media_index === "number" ? a.provider_media_index : 0;
    const bi = typeof b.provider_media_index === "number" ? b.provider_media_index : 0;
    return ai !== bi ? ai - bi : a.id.localeCompare(b.id);
  });
}
