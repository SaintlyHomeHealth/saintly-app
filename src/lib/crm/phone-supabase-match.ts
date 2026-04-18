import { normalizedPhonesEquivalent } from "@/lib/crm/incoming-caller-lookup";
import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { normalizePhone } from "@/lib/phone/us-phone-format";

/**
 * NANP-only: matches stored formatted numbers like "(480) 571-2062" where a contiguous last-10
 * substring match fails but area/exchange/last4 appear in order with other characters between.
 */
export function nanpLooseDigitIlikePattern(last10: string): string | null {
  if (last10.length !== 10) return null;
  const a = last10.slice(0, 3);
  const b = last10.slice(3, 6);
  const c = last10.slice(6, 10);
  return `%${a}%${b}%${c}%`;
}

/**
 * Builds a PostgREST `.or(...)` filter for one or more phone columns so E.164, digit-only,
 * and formatted NANP storage all match inbound Twilio `From` values.
 */
export function buildPhoneColumnOrFilter(columns: string[], e164Key: string): string | null {
  const candidates = phoneLookupCandidates(e164Key);
  if (candidates.length === 0) return null;

  const digitsKey = normalizePhone(e164Key);
  const eqParts = columns.flatMap((col) => candidates.map((c) => `${col}.eq.${c}`));
  const orParts = [...eqParts];

  if (digitsKey.length >= 10) {
    const last10 = digitsKey.slice(-10);
    const loose = nanpLooseDigitIlikePattern(last10);
    if (loose) {
      for (const col of columns) {
        orParts.push(`${col}.ilike.${loose}`);
      }
    }
    const last10Ilike = `%${last10}%`;
    for (const col of columns) {
      orParts.push(`${col}.ilike.${last10Ilike}`);
    }
  }

  return orParts.join(",");
}

export function digitsKeyForIncomingPhone(e164Key: string): string {
  return normalizePhone(e164Key);
}

export function rowMatchesIncomingPhone(
  columnValues: Array<string | null | undefined>,
  digitsKey: string
): boolean {
  return columnValues.some((v) => normalizedPhonesEquivalent(v, digitsKey));
}
