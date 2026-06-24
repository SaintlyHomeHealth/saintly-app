/** RFC 2047 encoded-word decoding and safe subject normalization. */

const MIME_WORD_RE = /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g;

function decodeQuotedPrintableMimeWord(input: string): string {
  const cleaned = input.replace(/_/g, " ");
  const bytes: number[] = [];
  for (let i = 0; i < cleaned.length; i += 1) {
    if (cleaned[i] === "=" && i + 2 < cleaned.length) {
      bytes.push(Number.parseInt(cleaned.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      bytes.push(cleaned.charCodeAt(i));
    }
  }
  return Buffer.from(bytes).toString("utf8");
}

function decodeMimeWord(charset: string, encoding: string, value: string): string {
  const enc = encoding.toUpperCase();
  try {
    if (enc === "B") {
      const buf = Buffer.from(value.replace(/\s/g, ""), "base64");
      if (charset.toLowerCase() === "utf-8" || charset.toLowerCase() === "utf8") {
        return buf.toString("utf8");
      }
      return buf.toString("latin1");
    }
    if (enc === "Q") {
      return decodeQuotedPrintableMimeWord(value);
    }
  } catch {
    return value;
  }
  return value;
}

/** Decode RFC 2047 encoded-words in a header value (e.g. Subject). */
export function decodeMimeHeader(value: string | null | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  if (!raw.includes("=?")) return raw;

  const decoded = raw.replace(MIME_WORD_RE, (_match, charset, encoding, encoded) =>
    decodeMimeWord(String(charset), String(encoding), String(encoded))
  );
  return decoded.replace(/\s+/g, " ").trim();
}

/** Repair common UTF-8/latin1 mojibake (e.g. Ã¢Â€Â" → —). */
export function repairMojibake(text: string): string {
  if (!/[ÃÂâ€]/.test(text)) return text;
  try {
    const repaired = Buffer.from(text, "latin1").toString("utf8");
    if (repaired && repaired !== text && !/[Ã][\s\S]{0,3}Â/.test(repaired)) {
      return repaired;
    }
  } catch {
    /* keep original */
  }
  return text;
}

/** Normalize subject for display/storage: decode MIME, repair mojibake, use ASCII hyphen. */
export function normalizeEmailSubject(subject: string): string {
  let s = decodeMimeHeader(subject);
  s = repairMojibake(s);
  return s
    .replace(/\u2014/g, " - ")
    .replace(/\u2013/g, " - ")
    .replace(/\s+-\s+/g, " - ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** Encode a header value as RFC 2047 when it contains non-ASCII characters. */
export function encodeMimeHeaderValue(value: string): string {
  const normalized = normalizeEmailSubject(value);
  if (!/[^\x00-\x7F]/.test(normalized)) return normalized;
  const b64 = Buffer.from(normalized, "utf8").toString("base64");
  return `=?UTF-8?B?${b64}?=`;
}
