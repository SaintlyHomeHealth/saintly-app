/**
 * Spreadsheet text parser: UTF-8 / UTF-16 (with or without BOM), comma- or tab-delimited,
 * RFC4180-style quoted fields. No dependencies.
 */

const DEFAULT_DELIMITER = "," as const;

/** Strip BOM / zero-width chars that show up in bad decodes or Excel exports */
export function normalizeSpreadsheetText(text: string): string {
  return text.replace(/^\uFEFF/, "").replace(/\u200B/g, "");
}

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === delimiter && !inQuotes) {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
}

/** Count delimiter occurrences outside of double-quoted regions */
function countDelimiterOutsideQuotes(line: string, delimiter: string): number {
  let n = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
        continue;
      }
      inQuotes = !inQuotes;
    } else if (c === delimiter && !inQuotes) {
      n++;
    }
  }
  return n;
}

function detectDelimiter(firstLine: string): string {
  const tabs = countDelimiterOutsideQuotes(firstLine, "\t");
  const commas = countDelimiterOutsideQuotes(firstLine, ",");
  if (tabs > commas) return "\t";
  return DEFAULT_DELIMITER;
}

function looksLikeUtf16LeWithoutBom(u8: Uint8Array): boolean {
  if (u8.length < 8) return false;
  const n = Math.min(u8.length, 2048);
  let oddNulls = 0;
  let pairs = 0;
  for (let i = 1; i < n; i += 2) {
    pairs++;
    if (u8[i] === 0) oddNulls++;
  }
  if (pairs < 8) return false;
  return oddNulls / pairs > 0.45;
}

/**
 * Decode Facebook / Excel exports: UTF-8 (optional BOM), UTF-16 LE/BE (BOM), or UTF-16 LE
 * without BOM when the byte pattern matches Latin text in UTF-16LE.
 */
export function decodeSpreadsheetBytes(bytes: ArrayBuffer): string {
  const u8 = new Uint8Array(bytes);
  if (u8.length === 0) return "";

  if (u8.length >= 3 && u8[0] === 0xef && u8[1] === 0xbb && u8[2] === 0xbf) {
    return new TextDecoder("utf-8", { fatal: false }).decode(u8.subarray(3));
  }
  if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    return new TextDecoder("utf-16le", { fatal: false }).decode(u8.subarray(2));
  }
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    return new TextDecoder("utf-16be", { fatal: false }).decode(u8.subarray(2));
  }
  if (looksLikeUtf16LeWithoutBom(u8)) {
    return new TextDecoder("utf-16le", { fatal: false }).decode(u8);
  }

  return new TextDecoder("utf-8", { fatal: false }).decode(u8);
}

function parseDelimitedDocument(text: string): { headers: string[]; rows: string[][] } {
  const normalized = normalizeSpreadsheetText(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((l) => l.trim() !== "");
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }
  const delimiter = detectDelimiter(lines[0]);
  const headers = parseDelimitedLine(lines[0], delimiter);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseDelimitedLine(lines[i], delimiter);
    if (cells.every((c) => c === "")) continue;
    rows.push(cells);
  }
  return { headers, rows };
}

/** Parse from raw file bytes (preferred for uploads — handles UTF-16 and BOM). */
export function parseSpreadsheet(bytes: ArrayBuffer): { headers: string[]; rows: string[][] } {
  return parseDelimitedDocument(decodeSpreadsheetBytes(bytes));
}

/** Parse decoded text; detects tab vs comma from the first line. Prefer {@link parseSpreadsheet} for raw uploads. */
export function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  return parseDelimitedDocument(text);
}
