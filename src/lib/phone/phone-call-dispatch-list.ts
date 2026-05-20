import { isOutboundPstnBridgePhoneCallMetadata } from "@/lib/phone/outbound-pstn-bridge-config";
import { isMoveToCellBridgeLegMetadata } from "@/lib/phone/move-to-cell-types";
import { phoneRawToE164LookupKey } from "@/lib/phone/resolve-phone-display-identity";

/** Paul's mobile — used only for safe cleanup preview filters (E.164 + digits). */
export const DISPATCH_CLEANUP_STAFF_CELL_E164 = "+19167963306";

const STAFF_CELL_DIGITS = "19167963306";

/**
 * Internal PSTN-bridge staff-leg rows should not appear as normal Dispatch call log entries.
 */
export function isOutboundPstnBridgeStaffLegRow(metadata: Record<string, unknown> | null | undefined): boolean {
  return isOutboundPstnBridgePhoneCallMetadata(metadata);
}

export function normalizePhoneDigitsForMatch(raw: string | null | undefined): string {
  const key = phoneRawToE164LookupKey(raw ?? "");
  if (key) return key.replace(/\D/g, "");
  return (raw ?? "").replace(/\D/g, "");
}

/** True when the call's displayed party (inbound from / outbound to) is the staff cell. */
export function isPhoneCallDisplayedPartyStaffCell(input: {
  direction: string | null | undefined;
  from_e164: string | null | undefined;
  to_e164: string | null | undefined;
  staffCellE164?: string;
}): boolean {
  const staffDigits = normalizePhoneDigitsForMatch(
    input.staffCellE164 ?? DISPATCH_CLEANUP_STAFF_CELL_E164
  );
  if (!staffDigits) return false;
  const dir = (input.direction ?? "").trim().toLowerCase();
  const party = dir === "outbound" ? input.to_e164 : input.from_e164;
  return normalizePhoneDigitsForMatch(party) === staffDigits;
}

/**
 * Whether a row should appear on /workspace/phone/calls (Dispatch call log).
 */
export function shouldShowPhoneCallInWorkspaceDispatchList(row: {
  dispatch_hidden_at?: string | null;
  metadata?: Record<string, unknown> | null;
  direction?: string | null;
  from_e164?: string | null;
  to_e164?: string | null;
}): boolean {
  if (typeof row.dispatch_hidden_at === "string" && row.dispatch_hidden_at.trim()) {
    return false;
  }
  if (isOutboundPstnBridgeStaffLegRow(row.metadata)) {
    return false;
  }
  if (isMoveToCellBridgeLegMetadata(row.metadata)) {
    return false;
  }
  return true;
}

/** Rows matching one-time cleanup preview (review in SQL before UPDATE). */
export function matchesDispatchCleanupCandidate(row: {
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
  direction?: string | null;
  from_e164?: string | null;
  to_e164?: string | null;
  dispatch_hidden_at?: string | null;
}): boolean {
  if (typeof row.dispatch_hidden_at === "string" && row.dispatch_hidden_at.trim()) {
    return false;
  }
  if (isOutboundPstnBridgeStaffLegRow(row.metadata)) {
    return true;
  }
  const created = (row.created_at ?? "").trim();
  const may2026 =
    created.startsWith("2026-05-") || created.startsWith("2026-05-20") || created.includes("2026-05-20");
  if (!may2026) return false;
  if ((row.direction ?? "").trim().toLowerCase() !== "outbound") return false;
  return isPhoneCallDisplayedPartyStaffCell({
    direction: row.direction,
    from_e164: row.from_e164,
    to_e164: row.to_e164,
  });
}
