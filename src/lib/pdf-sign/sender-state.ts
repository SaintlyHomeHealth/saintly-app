/**
 * Persisted Saintly-side field capture during send flows.
 * Mirrors `signature_packets.sender_state` JSON shape used by finalize/render paths.
 */

export type PdfSignSenderStoredSignaturePaths = Record<string, { bucket: string; path: string }>;

export type PdfSignSenderStateV1 = {
  values?: Record<string, string | boolean>;
  signaturePaths?: PdfSignSenderStoredSignaturePaths;
  completedAt?: string;
  completedByStaffUserId?: string;
};

export function parsePdfSignSenderState(raw: unknown): PdfSignSenderStateV1 | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const vals = o.values && typeof o.values === "object" && !Array.isArray(o.values) ? (o.values as Record<string, unknown>) : {};
  const outVals: Record<string, string | boolean> = {};
  for (const [k, v] of Object.entries(vals)) {
    if (typeof v === "boolean") outVals[k] = v;
    else outVals[k] = String(v ?? "");
  }

  let signaturePaths: PdfSignSenderStoredSignaturePaths | undefined;
  const pathsRaw = o.signaturePaths;
  if (pathsRaw && typeof pathsRaw === "object" && !Array.isArray(pathsRaw)) {
    const sp: PdfSignSenderStoredSignaturePaths = {};
    for (const [key, pv] of Object.entries(pathsRaw as Record<string, unknown>)) {
      if (
        pv &&
        typeof pv === "object" &&
        !Array.isArray(pv) &&
        typeof (pv as { bucket?: unknown }).bucket === "string" &&
        typeof (pv as { path?: unknown }).path === "string"
      ) {
        sp[key] = { bucket: (pv as { bucket: string }).bucket, path: (pv as { path: string }).path };
      }
    }
    if (Object.keys(sp).length > 0) signaturePaths = sp;
  }

  return {
    values: Object.keys(outVals).length ? outVals : undefined,
    signaturePaths,
    completedAt: typeof o.completedAt === "string" ? o.completedAt : undefined,
    completedByStaffUserId: typeof o.completedByStaffUserId === "string" ? o.completedByStaffUserId : undefined,
  };
}
