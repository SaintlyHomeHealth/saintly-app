import { PDFDocument } from "pdf-lib";

import { generateFaxCoverSheetPdf } from "@/lib/fax/fax-cover-sheet-pdf";
import type { FaxCoverSheetFields } from "@/lib/fax/fax-cover-template-types";

const MAX_PACKET_FILES = 24;

function sniffIsPdf(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

function sniffIsPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

function sniffIsJpeg(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

export function isFaxPacketFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t === "application/pdf" || t === "application/x-pdf") return true;
  if (t === "image/jpeg" || t === "image/jpg" || t === "image/png") return true;
  const n = file.name.toLowerCase();
  return /\.(pdf|jpe?g|png)$/.test(n);
}

export async function fileToPdfPages(merged: PDFDocument, file: File): Promise<void> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = (file.type || "").toLowerCase();
  const name = file.name.toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf") || sniffIsPdf(bytes)) {
    const src = await PDFDocument.load(bytes, { ignoreEncryption: true });
    const copied = await merged.copyPages(src, src.getPageIndices());
    copied.forEach((p) => merged.addPage(p));
    return;
  }

  if (mime.includes("png") || name.endsWith(".png") || sniffIsPng(bytes)) {
    const img = await merged.embedPng(bytes);
    const page = merged.addPage([612, 792]);
    const { width, height } = page.getSize();
    const scale = Math.min((width - 80) / img.width, (height - 80) / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
    return;
  }

  if (mime.includes("jpeg") || mime.includes("jpg") || /\.jpe?g$/.test(name) || sniffIsJpeg(bytes)) {
    const img = await merged.embedJpg(bytes);
    const page = merged.addPage([612, 792]);
    const { width, height } = page.getSize();
    const scale = Math.min((width - 80) / img.width, (height - 80) / img.height, 1);
    const w = img.width * scale;
    const h = img.height * scale;
    page.drawImage(img, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
    return;
  }

  throw new Error(`Unsupported file type: ${file.name}. Use PDF, JPEG, or PNG.`);
}

export async function mergeAttachmentFiles(files: File[]): Promise<Uint8Array> {
  if (files.length === 0) throw new Error("Add at least one attachment.");
  if (files.length > MAX_PACKET_FILES) {
    throw new Error(`You can attach up to ${MAX_PACKET_FILES} files.`);
  }
  const merged = await PDFDocument.create();
  for (const file of files) {
    await fileToPdfPages(merged, file);
  }
  return merged.save();
}

export async function buildFaxPacketPdf(input: {
  coverFields: FaxCoverSheetFields;
  templateTitle?: string;
  attachmentFiles: File[];
}): Promise<{ pdfBytes: Uint8Array; pageCount: number }> {
  const coverBytes = await generateFaxCoverSheetPdf(input.coverFields, input.templateTitle);
  const packet = await PDFDocument.create();

  const coverDoc = await PDFDocument.load(coverBytes);
  const coverPages = await packet.copyPages(coverDoc, coverDoc.getPageIndices());
  coverPages.forEach((p) => packet.addPage(p));

  for (const file of input.attachmentFiles) {
    await fileToPdfPages(packet, file);
  }

  const pdfBytes = await packet.save();
  return { pdfBytes, pageCount: packet.getPageCount() };
}

export function formatPacketDate(d = new Date()): string {
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export { MAX_PACKET_FILES };
