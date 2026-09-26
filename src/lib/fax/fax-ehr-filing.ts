/** Alora EHR record-name limit. */
export const FAX_DISPLAY_TITLE_MAX_LEN = 50;

/** Suggested Alora record name. Shown as the empty-state hint in Fax Center. */
export const FAX_DISPLAY_TITLE_HINT = "LASTNAME, FIRSTNAME - Doc Type - MM-DD-YYYY";

const FILENAME_FORBIDDEN = /[\\/:*?"<>|\u0000-\u001f]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export const FAX_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Staff inbox disposition. Separate from the Telnyx transmission `status` column. */
export const FAX_INBOX_STATUSES = [
  "unfiled",
  "filed",
  "needs_admission",
  "wrong_recipient",
  "junk",
  "unreadable",
] as const;

export type FaxInboxStatus = (typeof FAX_INBOX_STATUSES)[number];

export const FAX_STATUS_NOTE_MAX_LEN = 500;

export const FAX_INBOX_STATUS_LABELS: Record<FaxInboxStatus, string> = {
  unfiled: "Unfiled",
  filed: "Filed",
  needs_admission: "Needs admission",
  wrong_recipient: "Wrong recipient",
  junk: "Junk",
  unreadable: "Unreadable",
};

/** Inbox sub-filters. `no_document` is the existing failed / empty transmission bucket. */
export type FaxFilingBucket = FaxInboxStatus | "no_document";

export const FAX_FILING_TABS: readonly { id: FaxFilingBucket; label: string }[] = [
  { id: "unfiled", label: "Unfiled" },
  { id: "filed", label: "Filed" },
  { id: "needs_admission", label: "Needs admission" },
  { id: "wrong_recipient", label: "Wrong recipient" },
  { id: "junk", label: "Junk" },
  { id: "unreadable", label: "Unreadable" },
  { id: "no_document", label: "Failed / no document" },
];

export function isFaxInboxStatus(raw: string): raw is FaxInboxStatus {
  return (FAX_INBOX_STATUSES as readonly string[]).includes(raw);
}

/** Missing or unknown values open the Unfiled queue (oldest first). */
export function parseFaxFilingBucket(raw: string): FaxFilingBucket {
  if (raw === "no_document") return "no_document";
  if (isFaxInboxStatus(raw)) return raw;
  return "unfiled";
}

export function faxInboxStatus(row: {
  inbox_status?: string | null;
  filed_to_ehr_at?: string | null;
}): FaxInboxStatus {
  if (row.inbox_status && isFaxInboxStatus(row.inbox_status)) return row.inbox_status;
  return row.filed_to_ehr_at ? "filed" : "unfiled";
}

/** Trim only. Empty becomes null. Rejects notes over 500 characters. */
export function normalizeFaxStatusNote(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const normalized = raw.trim();
  if (!normalized) return { ok: true, value: null };
  if (normalized.length > FAX_STATUS_NOTE_MAX_LEN) {
    return { ok: false, error: `Status note must be ${FAX_STATUS_NOTE_MAX_LEN} characters or fewer.` };
  }
  return { ok: true, value: normalized };
}

type InboxFilingQuery<Q> = {
  eq: (column: string, value: unknown) => Q;
  or: (filters: string) => Q;
  not: (column: string, operator: string, value: unknown) => Q;
};

/**
 * One inbox tab. Unfiled is the workable queue (has a document, transmission did not fail).
 * Failed / no document stays a separate tab and only includes still-unfiled rows.
 */
export function applyFaxInboxFilingFilter<Q extends InboxFilingQuery<Q>>(query: Q, filing: FaxFilingBucket): Q {
  let next = query.eq("direction", "inbound").eq("is_archived", false);
  if (filing === "no_document") {
    return next.eq("inbox_status", "unfiled").or("status.ilike.*failed*,has_fax_document.eq.false");
  }
  next = next.eq("inbox_status", filing);
  if (filing === "unfiled") {
    return next.eq("has_fax_document", true).not("status", "ilike", "%failed%");
  }
  return next;
}

export function parseFaxIds(faxIds: unknown, max = 50): string[] {
  if (!Array.isArray(faxIds)) return [];
  return [...new Set(faxIds.map((id) => String(id).trim()).filter((id) => FAX_ID_UUID_RE.test(id)))].slice(0, max);
}

/** Trim, collapse whitespace, and cap at Alora's 50-character record name. Empty becomes null. */
export function normalizeFaxDisplayTitle(raw: string): { ok: true; value: string | null } | { ok: false; error: string } {
  const normalized = raw.replace(/\s+/g, " ").trim();
  if (!normalized) return { ok: true, value: null };
  if (normalized.length > FAX_DISPLAY_TITLE_MAX_LEN) {
    return { ok: false, error: `Record name must be ${FAX_DISPLAY_TITLE_MAX_LEN} characters or fewer.` };
  }
  return { ok: true, value: normalized };
}

/** Patient portion of `LASTNAME, FIRSTNAME - Doc Type - MM-DD-YYYY`. */
export function ehrPatientNameFromDisplayTitle(displayTitle: string | null | undefined): string | null {
  const title = displayTitle?.replace(/\s+/g, " ").trim();
  if (!title) return null;
  const head = title.split(/\s+-\s+/)[0]?.trim() || title;
  return head.slice(0, 120) || null;
}

export function faxHasDocument(row: { storage_path?: string | null; media_url?: string | null }): boolean {
  if (typeof row.storage_path === "string" && row.storage_path.trim()) return true;
  if (typeof row.media_url === "string" && row.media_url.trim()) return true;
  return false;
}

export function faxStatusIsFailed(status: string | null | undefined): boolean {
  return (status ?? "").toLowerCase().includes("failed");
}

/**
 * Inbox → Unfiled: inbound, not archived, disposition unfiled, not failed, has a document.
 * Keep this aligned with {@link applyFaxInboxFilingFilter} for the `unfiled` tab.
 */
export function isUnfiledInboundFax(row: {
  direction: string;
  is_archived: boolean;
  status: string | null;
  storage_path?: string | null;
  media_url?: string | null;
  filed_to_ehr_at?: string | null;
  inbox_status?: string | null;
  has_fax_document?: boolean | null;
}): boolean {
  const hasDocument = row.has_fax_document === true || faxHasDocument(row);
  return (
    row.direction === "inbound" &&
    !row.is_archived &&
    faxInboxStatus(row) === "unfiled" &&
    !faxStatusIsFailed(row.status) &&
    hasDocument
  );
}

/** Heading shown for a fax. A saved record name replaces the OCR / AI note. */
export function faxVisibleRecordName(row: {
  display_title?: string | null;
  note?: string | null;
  subject?: string | null;
  direction?: string | null;
}): string {
  const title = row.display_title?.trim();
  if (title) return title;
  if (row.direction === "outbound") {
    return row.subject?.trim() || "Outbound fax";
  }
  return row.note?.trim() || row.subject?.trim() || "Inbound fax";
}

function filenameBase(raw: string | null | undefined, maxLen: number): string {
  const cleaned = (raw ?? "")
    .replace(FILENAME_FORBIDDEN, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "")
    .replace(/\.pdf$/i, "")
    .trim();
  if (!cleaned) return "";
  const base = WINDOWS_RESERVED.test(cleaned) ? `fax-${cleaned}` : cleaned;
  return base.slice(0, maxLen);
}

/**
 * Download name `${display_title}.pdf`, with characters Windows/macOS reject removed.
 * Falls back to the note, then a short id, when the record name is blank.
 */
export function faxPdfFilename(input: {
  displayTitle?: string | null;
  note?: string | null;
  faxId?: string | null;
}): string {
  const fromTitle = filenameBase(input.displayTitle, FAX_DISPLAY_TITLE_MAX_LEN);
  const fromNote = filenameBase(input.note, 80);
  const fromId = input.faxId ? filenameBase(`fax-${input.faxId.slice(0, 8)}`, 40) : "";
  const base = fromTitle || fromNote || fromId || "fax";
  return `${base}.pdf`;
}

/** Unique zip entry names when several faxes share a record name. */
export function uniqueFaxPdfZipName(used: Set<string>, filename: string): string {
  const key = filename.toLowerCase();
  if (!used.has(key)) {
    used.add(key);
    return filename;
  }
  const stem = filename.replace(/\.pdf$/i, "");
  let n = 2;
  let next = `${stem} (${n}).pdf`;
  while (used.has(next.toLowerCase())) {
    n += 1;
    next = `${stem} (${n}).pdf`;
  }
  used.add(next.toLowerCase());
  return next;
}

export function contentDispositionAttachment(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
