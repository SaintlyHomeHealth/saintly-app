import { isValidE164 } from "@/lib/softphone/phone-number";

/**
 * Workspace softphone outbound caller ID ("Call as").
 *
 * - Primary line: `TWILIO_SOFTPHONE_CALLER_ID_E164` (required for softphone; unchanged as default From).
 * - Extra lines: optional `TWILIO_SOFTPHONE_OUTBOUND_LINES_JSON` — `[{ "e164": "+1…", "label": "Scheduling", "default": true }]`.
 * - Optional withheld / restricted line for "Block caller ID" row: `TWILIO_SOFTPHONE_WITHHELD_CLI_E164` (must be a Twilio-owned or verified DID; behavior depends on carrier + Twilio account).
 * - Display: `TWILIO_SOFTPHONE_ORG_LABEL` (optional).
 */

export type SoftphoneOutboundLine = {
  e164: string;
  label: string;
  is_default: boolean;
};

export type SoftphoneOutboundCallerConfig = {
  orgLabel: string;
  defaultE164: string;
  lines: SoftphoneOutboundLine[];
  /** When set, UI may offer "Block caller ID" and Twilio `From` uses this E.164. */
  withheldCliE164: string | null;
};

function dedupeLines(lines: SoftphoneOutboundLine[]): SoftphoneOutboundLine[] {
  const seen = new Set<string>();
  const out: SoftphoneOutboundLine[] = [];
  for (const l of lines) {
    if (seen.has(l.e164)) continue;
    seen.add(l.e164);
    out.push(l);
  }
  return out;
}

/** Returns `null` if primary env is missing or invalid — same gate as legacy softphone route. */
export function loadSoftphoneOutboundCallerConfigFromEnv(): SoftphoneOutboundCallerConfig | null {
  const primary = process.env.TWILIO_SOFTPHONE_CALLER_ID_E164?.trim() || "";
  if (!primary || !isValidE164(primary)) return null;

  const orgLabel = process.env.TWILIO_SOFTPHONE_ORG_LABEL?.trim() || "Saintly Home Health";
  const jsonRaw = process.env.TWILIO_SOFTPHONE_OUTBOUND_LINES_JSON?.trim();
  const withheldRaw = process.env.TWILIO_SOFTPHONE_WITHHELD_CLI_E164?.trim() || "";

  let lines: SoftphoneOutboundLine[] = [];
  if (jsonRaw) {
    try {
      const parsed = JSON.parse(jsonRaw) as unknown;
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (!item || typeof item !== "object") continue;
          const o = item as Record<string, unknown>;
          const e164 = typeof o.e164 === "string" ? o.e164.trim() : "";
          const label = typeof o.label === "string" && o.label.trim() ? o.label.trim() : "Line";
          const isDefault = Boolean(o.default ?? o.isDefault);
          if (isValidE164(e164)) lines.push({ e164, label, is_default: isDefault });
        }
      }
    } catch {
      /* ignore malformed JSON */
    }
  }

  if (lines.length === 0) {
    lines = [{ e164: primary, label: "Main", is_default: true }];
  } else {
    lines = dedupeLines(lines);
    const anyDefault = lines.some((l) => l.is_default);
    if (!anyDefault) {
      const ix = lines.findIndex((l) => l.e164 === primary);
      if (ix >= 0) {
        lines = lines.map((l, i) => ({ ...l, is_default: i === ix }));
      } else {
        lines = lines.map((l, i) => ({ ...l, is_default: i === 0 }));
      }
    }
  }

  const defaultLine = lines.find((l) => l.is_default) ?? lines[0];
  const defaultE164 = defaultLine?.e164 ?? primary;

  const withheldCliE164 = withheldRaw && isValidE164(withheldRaw) ? withheldRaw : null;

  return {
    orgLabel,
    defaultE164,
    lines,
    withheldCliE164,
  };
}

export function buildSoftphoneOutboundAllowlist(config: SoftphoneOutboundCallerConfig): Set<string> {
  const s = new Set<string>();
  for (const l of config.lines) s.add(l.e164);
  const primary = process.env.TWILIO_SOFTPHONE_CALLER_ID_E164?.trim();
  if (primary && isValidE164(primary)) s.add(primary);
  if (config.withheldCliE164) s.add(config.withheldCliE164);
  return s;
}

/**
 * Resolves Twilio PSTN `From` / `<Dial callerId>` from the Twilio Client custom parameter `OutboundCli`
 * (set by the browser SDK). Values: empty → default line; E.164 → must be allowlisted; `block` → withheld line or default.
 */
export function resolveSoftphoneOutboundFromE164(input: {
  config: SoftphoneOutboundCallerConfig;
  outboundCliRaw: string | undefined;
  allowlist: Set<string>;
}): { e164: string; requestedPresentation: "default" | "withheld" | "explicit" } {
  const raw = input.outboundCliRaw?.trim() ?? "";
  if (!raw) {
    return { e164: input.config.defaultE164, requestedPresentation: "default" };
  }
  if (raw.toLowerCase() === "block") {
    if (input.config.withheldCliE164) {
      return { e164: input.config.withheldCliE164, requestedPresentation: "withheld" };
    }
    return { e164: input.config.defaultE164, requestedPresentation: "withheld" };
  }
  if (isValidE164(raw) && input.allowlist.has(raw)) {
    return { e164: raw, requestedPresentation: "explicit" };
  }
  return { e164: input.config.defaultE164, requestedPresentation: "default" };
}
