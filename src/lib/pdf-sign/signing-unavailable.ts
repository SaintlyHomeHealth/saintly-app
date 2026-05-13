/**
 * Recipient-facing messaging when signing must not proceed.
 */

export const PDF_SIGN_UNAVAILABLE_MESSAGE =
  "This signing request has been canceled or is no longer available.";

export type PacketSigningGuardsRow = {
  status: string;
  deleted_at?: string | null;
  canceled_at?: string | null;
  voided_at?: string | null;
};

export function isSigningRequestUnavailable(packet: PacketSigningGuardsRow): boolean {
  if (packet.deleted_at) return true;
  if (packet.voided_at) return true;
  if (packet.status === "canceled" || packet.canceled_at) return true;
  return false;
}
