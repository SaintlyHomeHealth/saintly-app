/**
 * Display helpers for CRM linkage on packets. Safe for client/server.
 * Manual sends persist a sentinel id when no profile is attached.
 */

export const PDF_SIGN_MANUAL_SEND_CRM_ENTITY_ID = "00000000-0000-0000-0000-000000000000" as const;

export function isPdfSignManualSendCrmRecordId(id: string | null | undefined): boolean {
  if (id == null || !String(id).trim()) return true;
  return String(id).trim().toLowerCase() === PDF_SIGN_MANUAL_SEND_CRM_ENTITY_ID;
}

/** Packet row has real CRM linkage (not a standalone manual send placeholder). */
export function hasPdfSignCrmLinkage(crmEntityId: string | null | undefined): boolean {
  return Boolean(crmEntityId?.trim()) && !isPdfSignManualSendCrmRecordId(crmEntityId);
}
