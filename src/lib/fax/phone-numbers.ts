export function normalizeFaxNumberToE164(value: string | null | undefined): string | null {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  if (raw.startsWith("+") && digits.length >= 8) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }
  if (digits.length >= 8) {
    return `+${digits}`;
  }
  return null;
}

export function faxNumberSearchVariants(value: string | null | undefined): string[] {
  const e164 = normalizeFaxNumberToE164(value);
  const digits = String(value ?? "").replace(/\D/g, "");
  const variants = new Set<string>();
  if (e164) variants.add(e164);
  if (digits) variants.add(digits);
  if (digits.length === 10) variants.add(`1${digits}`);
  if (digits.length === 11 && digits.startsWith("1")) variants.add(digits.slice(1));
  return [...variants];
}
