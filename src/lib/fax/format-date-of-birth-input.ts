/** Strip to digits and format as MM/DD/YYYY while typing (max 8 digits). */
export function formatDateOfBirthInput(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

/** Format DOB for fax cover sheet display (accepts raw or partially formatted input). */
export function formatDateOfBirthDisplay(value: string | null | undefined): string {
  const formatted = formatDateOfBirthInput(String(value ?? ""));
  return formatted || "—";
}
