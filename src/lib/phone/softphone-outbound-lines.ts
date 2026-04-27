/**
 * Shared parsing for GET /api/workspace/phone/softphone-capabilities outbound line payloads.
 * Keeps the dialer, SMS Text-from bar, and other clients aligned on snake_case / camelCase shapes.
 */

export type SoftphoneOutboundLineRow = { e164: string; label: string; is_default: boolean };

/**
 * Client-side normalize for softphone capabilities JSON:
 * accept `outbound_lines` or `outboundLines`, and per-row `is_default` or `default`.
 */
export function parseOutboundLinesFromCapabilitiesPayload(
  j: Record<string, unknown>
): SoftphoneOutboundLineRow[] | undefined {
  const raw = j.outbound_lines ?? j.outboundLines;
  if (!Array.isArray(raw)) return undefined;
  const out: SoftphoneOutboundLineRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const e164 = typeof o.e164 === "string" ? o.e164.trim() : "";
    if (!e164) continue;
    const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : "Line";
    const is_default = Boolean(o.is_default ?? o.default);
    out.push({ e164, label, is_default });
  }
  return out.length ? out : undefined;
}
