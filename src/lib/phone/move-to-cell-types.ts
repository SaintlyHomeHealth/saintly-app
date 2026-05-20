/** UI + server state for mid-call browser → staff cell handoff. */
export type MoveToCellStatus =
  | "idle"
  | "ringing"
  | "press_1"
  | "connected_on_cell"
  | "failed";

export type MoveToCellMeta = {
  status: MoveToCellStatus;
  staff_user_id: string;
  staff_cell_e164: string;
  conference_sid: string;
  conference_friendly_name: string;
  client_call_sid: string;
  customer_call_sid: string | null;
  cell_call_sid: string | null;
  direction: "inbound" | "outbound";
  lead_id?: string | null;
  contact_id?: string | null;
  patient_id?: string | null;
  requested_at: string;
  updated_at: string;
  last_error?: string | null;
  /** Machine-readable code for logs / UI formatting. */
  failure_reason?: string | null;
};

export const MOVE_TO_CELL_EVENT_TYPES = [
  "move_to_cell_requested",
  "move_to_cell_ringing",
  "move_to_cell_confirmed",
  "browser_leg_removed_after_cell_join",
  "staff_cell_joined_with_end_conference_on_exit",
  "move_to_cell_staff_cell_hangup_ended_conference",
  "move_to_cell_failed",
] as const;

export type MoveToCellEventType = (typeof MOVE_TO_CELL_EVENT_TYPES)[number];

/** UI poll: status + error even when full MoveToCellMeta validation fails. */
export function readMoveToCellUiState(
  metadata: Record<string, unknown> | null | undefined
): { status: MoveToCellStatus; last_error: string | null; failure_reason: string | null } | null {
  const full = readMoveToCellMeta(metadata);
  if (full) {
    return {
      status: full.status,
      last_error: full.last_error ?? null,
      failure_reason: full.failure_reason ?? null,
    };
  }
  const raw = metadata?.move_to_cell;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const status = o.status;
  if (
    status !== "idle" &&
    status !== "ringing" &&
    status !== "press_1" &&
    status !== "connected_on_cell" &&
    status !== "failed"
  ) {
    return null;
  }
  return {
    status,
    last_error: typeof o.last_error === "string" ? o.last_error : null,
    failure_reason: typeof o.failure_reason === "string" ? o.failure_reason : null,
  };
}

export function readMoveToCellMeta(metadata: Record<string, unknown> | null | undefined): MoveToCellMeta | null {
  const raw = metadata?.move_to_cell;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const status = o.status;
  if (
    status !== "idle" &&
    status !== "ringing" &&
    status !== "press_1" &&
    status !== "connected_on_cell" &&
    status !== "failed"
  ) {
    return null;
  }
  const staffUserId = typeof o.staff_user_id === "string" ? o.staff_user_id.trim() : "";
  const staffCell = typeof o.staff_cell_e164 === "string" ? o.staff_cell_e164.trim() : "";
  const conferenceSid = typeof o.conference_sid === "string" ? o.conference_sid.trim() : "";
  const friendly = typeof o.conference_friendly_name === "string" ? o.conference_friendly_name.trim() : "";
  const clientSid = typeof o.client_call_sid === "string" ? o.client_call_sid.trim() : "";
  if (!staffUserId || !staffCell || !conferenceSid || !friendly || !clientSid) return null;
  const direction = o.direction === "inbound" ? "inbound" : "outbound";
  return {
    status,
    staff_user_id: staffUserId,
    staff_cell_e164: staffCell,
    conference_sid: conferenceSid,
    conference_friendly_name: friendly,
    client_call_sid: clientSid,
    customer_call_sid:
      typeof o.customer_call_sid === "string" && o.customer_call_sid.startsWith("CA")
        ? o.customer_call_sid.trim()
        : null,
    cell_call_sid:
      typeof o.cell_call_sid === "string" && o.cell_call_sid.startsWith("CA") ? o.cell_call_sid.trim() : null,
    direction,
    lead_id: typeof o.lead_id === "string" ? o.lead_id : null,
    contact_id: typeof o.contact_id === "string" ? o.contact_id : null,
    patient_id: typeof o.patient_id === "string" ? o.patient_id : null,
    requested_at: typeof o.requested_at === "string" ? o.requested_at : new Date().toISOString(),
    updated_at: typeof o.updated_at === "string" ? o.updated_at : new Date().toISOString(),
    last_error: typeof o.last_error === "string" ? o.last_error : null,
    failure_reason: typeof o.failure_reason === "string" ? o.failure_reason : null,
  };
}

/** Internal PSTN bridge leg for move-to-cell (hide from dispatch call log). */
export function isMoveToCellBridgeLegMetadata(meta: Record<string, unknown> | null | undefined): boolean {
  return meta?.source === "move_to_cell_bridge" || meta?.leg_role === "internal_transfer";
}
