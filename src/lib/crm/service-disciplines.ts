/** Codes persisted in `patients.service_disciplines` / `leads.service_disciplines` (text[]). */
export const SERVICE_DISCIPLINE_CODES = [
  "RN",
  "PT",
  "OT",
  "ST",
  "MSW",
  "HHA",
  "LPN",
] as const;

export type ServiceDisciplineCode = (typeof SERVICE_DISCIPLINE_CODES)[number];

const SET = new Set<string>(SERVICE_DISCIPLINE_CODES);

export function isValidServiceDisciplineCode(v: string): v is ServiceDisciplineCode {
  return SET.has(v);
}

export function parseServiceDisciplinesFromFormData(formData: FormData, key = "service_disciplines"): ServiceDisciplineCode[] {
  const raw = formData.getAll(key);
  const out: ServiceDisciplineCode[] = [];
  for (const v of raw) {
    if (typeof v !== "string") continue;
    const t = v.trim();
    if (isValidServiceDisciplineCode(t) && !out.includes(t)) out.push(t);
  }
  return out;
}

export function disciplineLabel(code: string): string {
  const c = code.trim();
  if (c === "LPN") return "LPN / LVN";
  return c;
}
