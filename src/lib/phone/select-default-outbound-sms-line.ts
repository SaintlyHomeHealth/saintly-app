import type { SoftphoneOutboundLineRow } from "@/lib/phone/softphone-outbound-lines";
import {
  isSaintlyBackupSmsE164,
  SAINTLY_PRIMARY_SMS_E164,
} from "@/lib/twilio/sms-from-numbers";

export type OutboundSmsLineForDefault = SoftphoneOutboundLineRow;

function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, "");
}

function findLineByDigits(
  lines: OutboundSmsLineForDefault[],
  e164: string
): OutboundSmsLineForDefault | undefined {
  const d = digitsOnly(e164);
  if (!d) return undefined;
  return lines.find((l) => digitsOnly(l.e164) === d);
}

function honorPreferredFrom(
  preferredFromE164: string | null | undefined,
  preferredFromExplicit: boolean | undefined
): string | null {
  const pref = preferredFromE164?.trim();
  if (!pref) return null;
  if (isSaintlyBackupSmsE164(pref) && !preferredFromExplicit) return null;
  return pref;
}

function lineLooksPrimaryOrMain(line: OutboundSmsLineForDefault): boolean {
  const x = line.label.toLowerCase();
  return (
    /\bmain\b/.test(x) ||
    x.includes("primary") ||
    x.includes("default line") ||
    x === "primary"
  );
}

/**
 * Picks the default outbound E.164 for workspace SMS "Text from" when the user has not
 * chosen a line for this thread scope.
 *
 * Order (after optional `currentSelectedE164` if still present in `lines`):
 * 1. Honored thread `preferredFromE164` (backup only when `preferredFromExplicit`).
 * 2. Line matching configured primary (`configuredPrimaryE164` or {@link SAINTLY_PRIMARY_SMS_E164}).
 * 3. Line with `is_default`.
 * 4. Line whose label suggests main/primary.
 * 5. Line matching +14803600008.
 * 6. First available line (non-empty `lines` only).
 * 7. Configured primary constant when `lines` is empty.
 */
export function selectDefaultOutboundSmsLine(input: {
  lines: OutboundSmsLineForDefault[];
  /** Defaults to {@link SAINTLY_PRIMARY_SMS_E164}. */
  configuredPrimaryE164?: string | null;
  preferredFromE164?: string | null;
  preferredFromExplicit?: boolean;
  /** UI pick (e.g. Text-from); kept only when it still exists in `lines`. */
  currentSelectedE164?: string | null;
}): string {
  const primaryCfg = (input.configuredPrimaryE164?.trim() || SAINTLY_PRIMARY_SMS_E164).trim();
  const lines = input.lines;

  const cur = input.currentSelectedE164?.trim();
  if (cur) {
    const hit = findLineByDigits(lines, cur);
    if (hit) return hit.e164;
  }

  const pref = honorPreferredFrom(input.preferredFromE164, input.preferredFromExplicit);
  if (pref) {
    const hit = findLineByDigits(lines, pref);
    if (hit) return hit.e164;
    return pref;
  }

  if (lines.length === 0) {
    return primaryCfg;
  }

  const byPrimaryCfg = findLineByDigits(lines, primaryCfg);
  if (byPrimaryCfg) return byPrimaryCfg.e164;

  const byDefault = lines.find((l) => l.is_default);
  if (byDefault) return byDefault.e164;

  const byMainLabel = lines.find((l) => lineLooksPrimaryOrMain(l));
  if (byMainLabel) return byMainLabel.e164;

  const bySaintlyPrimary = findLineByDigits(lines, SAINTLY_PRIMARY_SMS_E164);
  if (bySaintlyPrimary) return bySaintlyPrimary.e164;

  return lines[0].e164;
}
