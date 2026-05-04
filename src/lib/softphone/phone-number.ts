/** Basic E.164 check (ITU-T E.164: + followed by 1–15 digits, first digit non-zero). */
export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(value.trim());
}

/**
 * True when `digits10` is exactly 10 digits and satisfies coarse NANP rules for US/CA (+1) dialing
 * (reject impossible / reserved patterns such as area/exchange starting with 0 or 1, 555-01xx, all zeros).
 */
export function isPlausibleNanpNational10(digits10: string): boolean {
  if (!/^\d{10}$/.test(digits10)) return false;
  if (digits10 === "0000000000") return false;
  const area = digits10.slice(0, 3);
  const ex = digits10.slice(3, 6);
  if (area[0] === "0" || area[0] === "1") return false;
  if (ex[0] === "0" || ex[0] === "1") return false;
  if (area === "555" && ex.startsWith("01")) return false;
  return true;
}

/**
 * Workspace softphone PSTN destination: validates NANP for numbers under country code +1; other E.164
 * passes when {@link isValidE164} holds.
 */
export function isValidWorkspaceOutboundDestinationE164(e164: string): boolean {
  const t = e164.trim();
  if (!isValidE164(t)) return false;
  if (t.startsWith("+1")) {
    const national = t.slice(2);
    if (national.length !== 10 || !isPlausibleNanpNational10(national)) return false;
  }
  return true;
}

/**
 * Parse keypad / CRM input into a dialable E.164 for workspace outbound calls.
 * - US/CA: 10-digit NANP, optional leading 1, or +1…
 * - Other countries: full international E.164 (after stripping formatting inside `+…`).
 */
export function parseWorkspaceOutboundDialInput(raw: string): { ok: true; e164: string } | { ok: false } {
  const trimmed = raw.trim();
  if (!trimmed || /[*#]/.test(trimmed)) {
    return { ok: false };
  }

  if (trimmed.startsWith("+")) {
    const d = trimmed.slice(1).replace(/\D/g, "");
    if (!d.length) return { ok: false };
    if (d.startsWith("1") && d.length === 11) {
      const n10 = d.slice(1);
      if (!isPlausibleNanpNational10(n10)) return { ok: false };
      return { ok: true, e164: `+1${n10}` };
    }
    const compact = `+${d}`;
    if (!isValidE164(compact)) return { ok: false };
    return { ok: true, e164: compact };
  }

  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 10) {
    if (!isPlausibleNanpNational10(digits)) return { ok: false };
    return { ok: true, e164: `+1${digits}` };
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    const n10 = digits.slice(1);
    if (!isPlausibleNanpNational10(n10)) return { ok: false };
    return { ok: true, e164: `+1${n10}` };
  }

  return { ok: false };
}

/**
 * Normalize common US entry formats to E.164 (+1…).
 * Returns null if the result is not a plausible E.164.
 */
export function normalizeDialInputToE164(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return null;
  let n = digits;
  if (n.length === 10) {
    n = `1${n}`;
  }
  if (n.length === 11 && n.startsWith("1")) {
    return `+${n}`;
  }
  if (raw.trim().startsWith("+") && n.length >= 10 && n.length <= 15) {
    return `+${n}`;
  }
  return null;
}
