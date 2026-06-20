import { normalizePhone } from "@/lib/phone/us-phone-format";

import type { GlobalSearchResult } from "./types";

const CRM_PHONE_ENTITY_TYPES = new Set<GlobalSearchResult["type"]>(["lead", "patient", "contact"]);

function normalizedPhoneTail(phone: string | null | undefined): string | null {
  const digits = normalizePhone(phone ?? "");
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

/** Flags CRM search hits that share the same normalized phone number. */
export function annotateGlobalSearchPhoneDuplicates(
  results: GlobalSearchResult[]
): GlobalSearchResult[] {
  const countsByPhone = new Map<string, number>();

  for (const result of results) {
    if (!CRM_PHONE_ENTITY_TYPES.has(result.type)) continue;
    const tail = normalizedPhoneTail(result.phone);
    if (!tail) continue;
    countsByPhone.set(tail, (countsByPhone.get(tail) ?? 0) + 1);
  }

  return results.map((result) => {
    if (!CRM_PHONE_ENTITY_TYPES.has(result.type)) return result;
    const tail = normalizedPhoneTail(result.phone);
    if (!tail) return result;
    const sharedPhoneRecordCount = countsByPhone.get(tail) ?? 0;
    if (sharedPhoneRecordCount <= 1) return result;
    return {
      ...result,
      sharedPhoneRecordCount,
      sharedPhoneWarning: true,
    };
  });
}
