import type { FaxPageText } from "@/lib/fax/fax-document-text";

/** Recurring clinician / nurse names that must never be treated as the patient. */
export const KNOWN_NON_PATIENT_NAMES = [
  "victoria mcberty",
  "tawnya grover",
  "woundtech",
  "verse medical",
  "tango",
];

const NAME_TOKEN = "[A-Za-z][A-Za-z'.\\-]*";
const NAME_LABEL = new RegExp(
  String.raw`\b(?:patient\s*name|patient|pt\.?|member(?:\s*name)?|client(?:\s*name)?)\s*[:\-]\s*(${NAME_TOKEN}(?:[ \t]+${NAME_TOKEN}){0,3}(?:,[ \t]*${NAME_TOKEN}(?:[ \t]+${NAME_TOKEN}){0,2})?)`,
  "i"
);

const DOB_LABEL =
  /(?:patient\s*dob|d\.?o\.?b\.?|date of birth)\s*[:\-]\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{4}-\d{2}-\d{2})/i;

/** Woundtech / encounter headers: name + sex, usually under "Patient details". */
const SEX_LABELED_NAME = new RegExp(
  String.raw`(${NAME_TOKEN}(?:[ \t]+${NAME_TOKEN}){1,3})\s*\((?:fe)?male\)`,
  "i"
);

export type HeuristicNameHit = {
  patientName: string;
  patientDob: string | null;
  sourcePage: number;
};

export function normalizePersonName(raw: string): string | null {
  const cleaned = raw.replace(/\s+/g, " ").replace(/[.,;:]+$/g, "").trim();
  if (!cleaned || cleaned.length < 3) return null;
  if (KNOWN_NON_PATIENT_NAMES.some((n) => cleaned.toLowerCase().includes(n))) return null;
  if (/^(patient|name|member|client|pt|dob)$/i.test(cleaned)) return null;
  const blocked = new Set(["patient", "name", "member", "client", "pt", "dob", "date"]);
  const words = cleaned.split(/\s+/).filter((w) => !blocked.has(w.toLowerCase()));
  if (words.length < 2) return null;
  const cleanedWords = words.join(" ");

  if (cleanedWords.includes(",")) {
    const [last, first] = cleanedWords.split(",").map((s) => s.trim());
    if (last && first) return `${titleCase(last)}, ${titleCase(first)}`;
  }

  const last = words[words.length - 1]!;
  const first = words.slice(0, -1).join(" ");
  return `${titleCase(last)}, ${titleCase(first)}`;
}

function titleCase(s: string): string {
  return s
    .split(/\s+/)
    .map((w) => (w ? w[0]!.toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(" ");
}

export function parseDobToIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const t = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/.exec(t);
  if (!us) return null;
  const month = us[1]!.padStart(2, "0");
  const day = us[2]!.padStart(2, "0");
  let year = us[3]!;
  if (year.length === 2) year = Number(year) >= 30 ? `19${year}` : `20${year}`;
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return `${year}-${month}-${day}`;
}

/**
 * Prefer later pages over the cover sheet. Cover sheets carry the sending
 * facility, not the patient.
 */
export function heuristicPatientFromFaxPages(pages: FaxPageText[]): HeuristicNameHit | null {
  const ranked = [...pages].sort((a, b) => {
    const coverBias = (p: FaxPageText) => (p.page === 1 ? 1 : 0);
    return coverBias(a) - coverBias(b) || a.page - b.page;
  });

  for (const page of ranked) {
    const rawName = rawPatientNameFromPage(page.text);
    if (!rawName) continue;
    const patientName = normalizePersonName(rawName);
    if (!patientName) continue;
    const dobMatch = DOB_LABEL.exec(page.text);
    return {
      patientName,
      patientDob: parseDobToIso(dobMatch?.[1] ?? null),
      sourcePage: page.page,
    };
  }
  return null;
}

function rawPatientNameFromPage(text: string): string | null {
  const labeled = NAME_LABEL.exec(text);
  if (labeled?.[1]) return labeled[1];

  const detailsAt = text.search(/patient\s*details\b/i);
  if (detailsAt < 0) return null;
  const sexLabeled = SEX_LABELED_NAME.exec(text.slice(detailsAt));
  return sexLabeled?.[1] ?? null;
}
