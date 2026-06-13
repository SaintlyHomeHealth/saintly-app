import { normalizePhone } from "@/lib/phone/us-phone-format";

import type { ParsedGlobalSearchQuery } from "./types";

export function escapeIlikePattern(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

export function buildIlikePattern(raw: string): string {
  return `%${escapeIlikePattern(raw.trim())}%`;
}

export function parseGlobalSearchQuery(raw: string): ParsedGlobalSearchQuery | null {
  const trimmed = raw.trim();
  if (trimmed.length < 1) return null;

  const lower = trimmed.toLowerCase();
  const digits = normalizePhone(trimmed);
  const isEmail = trimmed.includes("@");
  const isPhone = !isEmail && digits.length >= 7;

  return {
    raw: trimmed,
    trimmed,
    lower,
    digits,
    isPhone,
    isEmail,
    ilikePattern: buildIlikePattern(trimmed),
  };
}
