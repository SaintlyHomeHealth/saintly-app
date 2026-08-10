export type ParsedVisitPasteRow = {
  patientName: string;
  clinicianName: string;
  /** ISO date YYYY-MM-DD */
  serviceDate: string;
  status: string;
  rawLine: string;
};

export type ParseVisitPasteResult = {
  rows: ParsedVisitPasteRow[];
  skippedIncomplete: number;
  warnings: string[];
};

const NAME_HEADER_RE = /^([A-Z][A-Z'`.\- ]+),\s*([A-Za-z][A-Za-z'`.\- ]+)\s*$/;
const VISIT_ROW_RE =
  /^(\d{1,2}\/\d{1,2}\/\d{4})\s+(.+?)\s+(Completed|Incomplete|Scheduled|Cancelled|Canceled|Pending)\b(.*)$/i;

/** Normalize "LAST, FIRST" or "First Last" for matching. */
export function normalizePersonNameKey(raw: string): string {
  const cleaned = raw
    .replace(/\s+/g, " ")
    .replace(/[^\w\s,'.\-]/g, "")
    .trim()
    .toLowerCase();
  if (!cleaned) return "";

  if (cleaned.includes(",")) {
    const [last, ...rest] = cleaned.split(",");
    const first = rest.join(" ").trim();
    return `${(last || "").trim()}|${first}`;
  }

  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 1) return `${parts[0]}|`;
  const last = parts[parts.length - 1]!;
  const first = parts.slice(0, -1).join(" ");
  return `${last}|${first}`;
}

export function formatLastFirstDisplay(raw: string): string {
  const key = normalizePersonNameKey(raw);
  if (!key) return raw.trim();
  const [last, first] = key.split("|");
  if (!last) return raw.trim();
  if (!first) return last.toUpperCase();
  return `${last.toUpperCase()}, ${first
    .split(" ")
    .map((p) => (p ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join(" ")}`;
}

function parseServiceDateToIso(mmddyyyy: string): string | null {
  const m = mmddyyyy.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const year = Number(m[3]);
  if (!Number.isFinite(month) || !Number.isFinite(day) || !Number.isFinite(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const iso = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const dt = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return null;
  if (dt.getMonth() + 1 !== month || dt.getDate() !== day) return null;
  return iso;
}

function looksLikeNameHeader(line: string): boolean {
  const t = line.trim();
  if (!t || /\t/.test(t)) return false;
  if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(t)) return false;
  return NAME_HEADER_RE.test(t);
}

/**
 * Parse EMR copy/paste: patient name header, then rows
 * `MM/DD/YYYY  CLINICIAN  Completed  Yes Yes Yes Yes`
 */
export function parseVisitPaste(text: string): ParseVisitPasteResult {
  const warnings: string[] = [];
  const rows: ParsedVisitPasteRow[] = [];
  let skippedIncomplete = 0;
  let currentPatient: string | null = null;

  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  for (const originalLine of lines) {
    const line = originalLine.replace(/\u00a0/g, " ").trim();
    if (!line) continue;

    if (looksLikeNameHeader(line)) {
      currentPatient = line.replace(/\s+/g, " ").trim();
      continue;
    }

    const tabNormalized = line.replace(/\t+/g, " ").replace(/\s{2,}/g, " ").trim();
    const match = tabNormalized.match(VISIT_ROW_RE);
    if (!match) {
      if (/^\d{1,2}\/\d{1,2}\/\d{4}/.test(tabNormalized)) {
        warnings.push(`Could not parse visit row: ${line.slice(0, 80)}`);
      }
      continue;
    }

    if (!currentPatient) {
      warnings.push(`Visit row before patient name: ${line.slice(0, 80)}`);
      continue;
    }

    const serviceDate = parseServiceDateToIso(match[1]!);
    if (!serviceDate) {
      warnings.push(`Invalid date on row: ${line.slice(0, 80)}`);
      continue;
    }

    const clinicianName = match[2]!.replace(/\s+/g, " ").trim();
    const status = match[3]!.trim();
    if (!clinicianName) {
      warnings.push(`Missing clinician on row: ${line.slice(0, 80)}`);
      continue;
    }

    if (!/^completed$/i.test(status)) {
      skippedIncomplete += 1;
      continue;
    }

    rows.push({
      patientName: currentPatient,
      clinicianName,
      serviceDate,
      status: "Completed",
      rawLine: line,
    });
  }

  if (!rows.length && !warnings.length) {
    warnings.push("No completed visit rows found. Paste patient name headers with visit lines under each.");
  }

  return { rows, skippedIncomplete, warnings };
}

export function buildImportFingerprint(input: {
  employeeId: string;
  patientKey: string;
  serviceDate: string;
  lineType: string;
}): string {
  const patientKey = normalizePersonNameKey(input.patientKey) || input.patientKey.trim().toLowerCase();
  return `${input.employeeId}|${patientKey}|${input.serviceDate}|${input.lineType}`;
}
