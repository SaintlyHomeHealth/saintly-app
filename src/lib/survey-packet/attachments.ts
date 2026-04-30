import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { supabaseAdmin } from "@/lib/admin";
import { normalizeCredentialTypeKey } from "@/lib/admin/employee-directory-data";
import { normalizePersonnelFileDocumentKey } from "@/lib/employee-requirements/personnel-file-requirements";

const APPLICANT_FILES_BUCKET = "applicant-files";
const EMPLOYEE_CREDENTIALS_BUCKET = "employee-credentials";

export type SurveyAttachmentSource = "applicant_file" | "legacy_document" | "employee_credential";

export type SurveyAttachmentCandidate = {
  dedupeKey: string;
  label: string;
  source: SurveyAttachmentSource;
  sourceId: string;
  typeLabel: string;
  uploadedAt: string | null;
  uploadedByNote: string | null;
  storageBucket: string;
  storagePath: string;
  fileNameGuess: string;
  mimeHint: string | null;
};

export type AttachmentInclusionResult = {
  label: string;
  source: SurveyAttachmentSource;
  typeLabel: string;
  uploadedAt: string | null;
  uploadedByNote: string | null;
  inclusionMode: "appended_pdf" | "zip_only";
  detailNote?: string;
};

export function getStorageObjectFromPublicUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match?.[2]) return null;
  return {
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2]),
  };
}

function formatReadableType(documentType: string | null, credentialType?: string | null) {
  if (credentialType) {
    return normalizeCredentialTypeKey(credentialType).replace(/_/g, " ");
  }
  const k = normalizePersonnelFileDocumentKey(documentType);
  return k ? k.replace(/_/g, " ") : "document";
}

function attachmentLabel(
  displayName: string | null | undefined,
  documentType: string | null | undefined,
  credentialType: string | null | undefined,
  fileName: string | null | undefined
) {
  const d = (displayName || "").trim();
  if (d) return d;
  const f = (fileName || "").trim();
  if (f) return f;
  return formatReadableType(documentType ?? null, credentialType ?? null);
}

export async function collectSurveyPacketAttachmentCandidates(
  employeeId: string
): Promise<SurveyAttachmentCandidate[]> {
  const [{ data: applicantFiles }, { data: documents }, { data: credentials }] = await Promise.all([
    supabaseAdmin
      .from("applicant_files")
      .select(
        "id, document_type, display_name, file_name, file_path, storage_path, file_type, created_at"
      )
      .eq("applicant_id", employeeId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("documents")
      .select("id, document_type, file_url, created_at")
      .eq("applicant_id", employeeId)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("employee_credentials")
      .select("id, credential_type, file_name, document_path, file_type, uploaded_at, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false }),
  ]);

  const candidates: SurveyAttachmentCandidate[] = [];
  const seenDedupe = new Set<string>();

  const pushUnique = (c: SurveyAttachmentCandidate) => {
    if (seenDedupe.has(c.dedupeKey)) return;
    seenDedupe.add(c.dedupeKey);
    candidates.push(c);
  };

  for (const row of applicantFiles || []) {
    const dt = (row.document_type || "").toLowerCase().trim();
    if (dt === "survey_packet") continue;

    const path = row.file_path || row.storage_path;
    if (!path) continue;

    pushUnique({
      dedupeKey: `applicant_file:${row.id}`,
      label: attachmentLabel(row.display_name, row.document_type, null, row.file_name),
      source: "applicant_file",
      sourceId: String(row.id),
      typeLabel: formatReadableType(row.document_type, null),
      uploadedAt: row.created_at || null,
      uploadedByNote: "Applicant / admin file upload",
      storageBucket: APPLICANT_FILES_BUCKET,
      storagePath: path,
      fileNameGuess: row.file_name || `${path.split("/").pop() || "upload"}`,
      mimeHint: row.file_type || null,
    });
  }

  for (const row of documents || []) {
    const storageObject = getStorageObjectFromPublicUrl(row.file_url);
    if (!storageObject?.path) continue;
    const bucket = storageObject.bucket || APPLICANT_FILES_BUCKET;

    pushUnique({
      dedupeKey: `legacy_document:${row.id}`,
      label: attachmentLabel(null, row.document_type, null, null),
      source: "legacy_document",
      sourceId: String(row.id),
      typeLabel: formatReadableType(row.document_type, null),
      uploadedAt: row.created_at || null,
      uploadedByNote: "Legacy document record",
      storageBucket: bucket,
      storagePath: storageObject.path,
      fileNameGuess: `${row.document_type || "document"}-${row.id}`,
      mimeHint: null,
    });
  }

  for (const row of credentials || []) {
    const path = row.document_path?.trim();
    if (!path) continue;

    pushUnique({
      dedupeKey: `employee_credential:${row.id}`,
      label: attachmentLabel(row.file_name, null, row.credential_type, row.file_name),
      source: "employee_credential",
      sourceId: String(row.id),
      typeLabel: formatReadableType(null, row.credential_type),
      uploadedAt: row.uploaded_at || row.created_at || null,
      uploadedByNote: "Credential record file",
      storageBucket: EMPLOYEE_CREDENTIALS_BUCKET,
      storagePath: path,
      fileNameGuess: row.file_name || path.split("/").pop() || "credential",
      mimeHint: row.file_type || null,
    });
  }

  const pathSeen = new Set<string>();
  const pathDeduped: SurveyAttachmentCandidate[] = [];
  for (const c of candidates) {
    const pk = `${c.storageBucket}:${c.storagePath}`;
    if (pathSeen.has(pk)) continue;
    pathSeen.add(pk);
    pathDeduped.push(c);
  }

  pathDeduped.sort((a, b) => {
    const ta = new Date(a.uploadedAt || 0).getTime();
    const tb = new Date(b.uploadedAt || 0).getTime();
    return tb - ta || a.label.localeCompare(b.label);
  });

  return pathDeduped;
}

async function downloadStorageBytes(
  bucket: string,
  path: string
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  const { data, error } = await supabaseAdmin.storage.from(bucket).download(path);
  if (error || !data) return null;
  const bytes = new Uint8Array(await data.arrayBuffer());
  const contentType = (data as Blob).type || null;
  return { bytes, contentType };
}

function sniffIsPdf(bytes: Uint8Array) {
  return bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF";
}

function sniffIsPng(bytes: Uint8Array) {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function sniffIsJpeg(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

const MAX_PDF_PAGES_TO_APPEND = 80;
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function drawMultilineText(
  page: PDFPage,
  text: string,
  x: number,
  startY: number,
  maxWidth: number,
  lineHeight: number,
  font: PDFFont,
  size: number
) {
  let y = startY;
  const words = text.split(/\s+/);
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
      page.drawText(line, { x, y, size, font, color: rgb(0.12, 0.12, 0.16) });
      y -= lineHeight;
      line = word;
    } else {
      line = test;
    }
  }
  if (line) {
    page.drawText(line, { x, y, size, font, color: rgb(0.12, 0.12, 0.16) });
    y -= lineHeight;
  }
  return y;
}

async function buildAttachmentIndexPdf(results: AttachmentInclusionResult[]): Promise<PDFDocument> {
  const indexPdf = await PDFDocument.create();
  const font = await indexPdf.embedFont(StandardFonts.Helvetica);
  const bold = await indexPdf.embedFont(StandardFonts.HelveticaBold);
  const width = 612;
  const height = 792;
  const margin = 48;
  let page = indexPdf.addPage([width, height]);
  let y = height - margin;

  const newPage = () => {
    page = indexPdf.addPage([width, height]);
    y = height - margin;
  };

  const title = (t: string, s = 14) => {
    if (y < margin + 60) newPage();
    page.drawText(t, { x: margin, y, size: s, font: bold, color: rgb(0.02, 0.39, 0.73) });
    y -= s + 12;
  };

  const bodyLine = (t: string, size = 10) => {
    if (y < margin + 40) newPage();
    y = drawMultilineText(page, t, margin, y, width - margin * 2, size + 4, font, size);
    y -= 4;
  };

  title("Uploaded Documents Included", 16);
  bodyLine(
    "Survey-ready packet index. “Appended to packet PDF” items are merged after this section into the same PDF file where the format allows. Other items remain available as originals in the Download Source Packet ZIP."
  );
  y -= 8;

  results.forEach((r, i) => {
    if (y < margin + 100) newPage();
    bodyLine(`${i + 1}. ${r.label}`, 11);
    bodyLine(`    Document type: ${r.typeLabel}`, 9);
    bodyLine(`    Source: ${r.source.replace(/_/g, " ")}`, 9);
    if (r.uploadedByNote) bodyLine(`    ${r.uploadedByNote}`, 9);
    bodyLine(`    Uploaded: ${r.uploadedAt || "—"}`, 9);
    bodyLine(
      `    In this PDF: ${
        r.inclusionMode === "appended_pdf"
          ? "Appended (see following pages)"
          : "Reference / placeholder only — original in source ZIP"
      }`,
      9
    );
    if (r.detailNote) bodyLine(`    Note: ${r.detailNote}`, 9);
    y -= 10;
  });

  return indexPdf;
}

async function addPlaceholderPage(
  pdf: PDFDocument,
  font: PDFFont,
  title: string,
  lines: string[]
) {
  const page = pdf.addPage([612, 792]);
  let y = 792 - 48;
  page.drawText("Attachment — not embedded", {
    x: 48,
    y,
    size: 14,
    font,
    color: rgb(0.75, 0.35, 0.15),
  });
  y -= 28;
  page.drawText(title, { x: 48, y, size: 12, font, color: rgb(0.1, 0.1, 0.14) });
  y -= 22;
  for (const line of lines) {
    y = drawMultilineText(page, line, 48, y, 516, 14, font, 10);
    y -= 8;
  }
}

/**
 * Merges attachment binary pages into a standalone PDF (bodies only, no index).
 */
async function buildAttachmentBodiesPdf(
  candidates: SurveyAttachmentCandidate[]
): Promise<{ bodies: PDFDocument; results: AttachmentInclusionResult[] }> {
  const bodies = await PDFDocument.create();
  const font = await bodies.embedFont(StandardFonts.Helvetica);
  const results: AttachmentInclusionResult[] = [];

  for (const c of candidates) {
    const baseMeta: Omit<AttachmentInclusionResult, "inclusionMode" | "detailNote"> = {
      label: c.label,
      source: c.source,
      typeLabel: c.typeLabel,
      uploadedAt: c.uploadedAt,
      uploadedByNote: c.uploadedByNote,
    };

    const dl = await downloadStorageBytes(c.storageBucket, c.storagePath);
    if (!dl || dl.bytes.length === 0) {
      results.push({
        ...baseMeta,
        inclusionMode: "zip_only",
        detailNote: "Not retrieved from storage for merge.",
      });
      continue;
    }

    if (dl.bytes.length > MAX_ATTACHMENT_BYTES) {
      await addPlaceholderPage(bodies, font, c.label, [
        "File exceeds merge size limit.",
        "Download the source packet ZIP (02-uploaded-credentials) for the original.",
      ]);
      results.push({
        ...baseMeta,
        inclusionMode: "zip_only",
        detailNote: "Oversize for inline merge; included in ZIP.",
      });
      continue;
    }

    const mime = (c.mimeHint || dl.contentType || "").toLowerCase();
    let appended = false;
    let detailNote: string | undefined;

    if (mime.includes("pdf") || sniffIsPdf(dl.bytes)) {
      try {
        const src = await PDFDocument.load(dl.bytes, { ignoreEncryption: true });
        const indices = src.getPageIndices();
        const take = indices.slice(0, MAX_PDF_PAGES_TO_APPEND);
        const copied = await bodies.copyPages(src, take);
        copied.forEach((p) => bodies.addPage(p));
        appended = copied.length > 0;
        if (indices.length > take.length) {
          detailNote = `Long PDF: embedded first ${take.length} of ${indices.length} pages; full file in ZIP.`;
        }
      } catch {
        appended = false;
      }
    }

    if (!appended && (mime.includes("png") || sniffIsPng(dl.bytes))) {
      try {
        const img = await bodies.embedPng(dl.bytes);
        const page = bodies.addPage([612, 792]);
        const { width, height } = page.getSize();
        const scale = Math.min((width - 80) / img.width, (height - 80) / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, {
          x: (width - w) / 2,
          y: (height - h) / 2,
          width: w,
          height: h,
        });
        appended = true;
      } catch {
        appended = false;
      }
    }

    if (!appended && (mime.includes("jpeg") || mime.includes("jpg") || sniffIsJpeg(dl.bytes))) {
      try {
        const img = await bodies.embedJpg(dl.bytes);
        const page = bodies.addPage([612, 792]);
        const { width, height } = page.getSize();
        const scale = Math.min((width - 80) / img.width, (height - 80) / img.height, 1);
        const w = img.width * scale;
        const h = img.height * scale;
        page.drawImage(img, {
          x: (width - w) / 2,
          y: (height - h) / 2,
          width: w,
          height: h,
        });
        appended = true;
      } catch {
        appended = false;
      }
    }

    if (appended) {
      results.push({ ...baseMeta, inclusionMode: "appended_pdf", detailNote });
    } else {
      await addPlaceholderPage(bodies, font, c.label, [
        "Format not embedded in this packet PDF (e.g. WEBP/HEIC or unsupported PDF).",
        "Original file is in the source packet ZIP under 02-uploaded-credentials/.",
      ]);
      results.push({
        ...baseMeta,
        inclusionMode: "zip_only",
        detailNote: detailNote || "See source ZIP for original.",
      });
    }
  }

  return { bodies, results };
}

/**
 * After the summary PDF is complete: prepend index and append merged uploads.
 * Returns a new PDF buffer (caller replaces output).
 */
export async function mergeSurveyPacketAttachmentSection(
  summaryPdfBytes: Uint8Array,
  employeeId: string
): Promise<{ pdfBytes: Uint8Array; inclusionResults: AttachmentInclusionResult[] }> {
  const candidates = await collectSurveyPacketAttachmentCandidates(employeeId);
  if (candidates.length === 0) {
    return { pdfBytes: summaryPdfBytes, inclusionResults: [] };
  }

  const summaryDoc = await PDFDocument.load(summaryPdfBytes, { ignoreEncryption: true });
  const { bodies, results } = await buildAttachmentBodiesPdf(candidates);
  const indexPdf = await buildAttachmentIndexPdf(results);

  const combined = await PDFDocument.create();
  const summaryPages = await combined.copyPages(summaryDoc, summaryDoc.getPageIndices());
  summaryPages.forEach((p) => combined.addPage(p));

  const indexPages = await combined.copyPages(indexPdf, indexPdf.getPageIndices());
  indexPages.forEach((p) => combined.addPage(p));

  const bodyPages = await combined.copyPages(bodies, bodies.getPageIndices());
  bodyPages.forEach((p) => combined.addPage(p));

  const pdfBytes = await combined.save();
  return { pdfBytes, inclusionResults: results };
}

export async function downloadAttachmentBytesForZip(
  c: SurveyAttachmentCandidate
): Promise<Uint8Array | null> {
  const dl = await downloadStorageBytes(c.storageBucket, c.storagePath);
  return dl?.bytes ?? null;
}
