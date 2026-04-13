/** UI masking for Medicare identifiers — does not encrypt at rest. */
export function maskMedicareIdentifier(raw: string | null | undefined): string {
  const t = typeof raw === "string" ? raw.trim() : "";
  if (!t) return "";
  if (t.length <= 4) return "•".repeat(t.length);
  return `${t.slice(0, 2)}•••••••${t.slice(-4)}`;
}
