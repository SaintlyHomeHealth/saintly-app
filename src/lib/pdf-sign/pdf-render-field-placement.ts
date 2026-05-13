/**
 * Placement math when flattening overlay fields onto a PDF via pdf-lib.
 * Stored coords use PDF user space — origin bottom-left — same as overlay authoring.
 */

/** Single-line Helvetica-like fields: bounded size, anchored near baseline of short boxes. */
export function getSingleLineFontSize(rectHeightPt: number, textLength: number): number {
  const fromHeight = typeof rectHeightPt === "number" && rectHeightPt > 0 ? rectHeightPt * 0.42 : 10;
  const fromLen =
    typeof textLength === "number" && textLength > 40 ? Math.max(8, 11 - Math.floor(textLength / 120)) : 11;
  return Math.max(8, Math.min(11, Math.min(fromHeight, fromLen)));
}

/** Baseline `y` in pdf-lib coords (distance from bottom of page upward). */
export function textBaselinePdfY(args: {
  /** Lower-left y of field rect in PDF space. */
  fieldBottomYPdf: number;
  /** Field height in pts. */
  fieldHeightPdf: number;
  fontSize: number;
}): number {
  const { fieldBottomYPdf, fieldHeightPdf: h, fontSize } = args;
  if (typeof h !== "number" || h <= 0) return fieldBottomYPdf + fontSize * 0.25;
  if (h <= 34) {
    return fieldBottomYPdf + 3 + fontSize * 0.2;
  }
  const inner = Math.max(fontSize + 4, h - 6);
  return fieldBottomYPdf + (inner - fontSize) / 2 + fontSize * 0.08;
}

export function signatureImageDrawRectPdf(args: {
  fieldXPdf: number;
  fieldYPdf: number;
  /** Lower-left anchored box from template. */
  fieldWidthPdf: number;
  fieldHeightPdf: number;
  imageWidthPx: number;
  imageHeightPx: number;
}): { x: number; y: number; width: number; height: number } {
  const padX = 4;
  const padY = 2;
  const maxW = Math.max(14, args.fieldWidthPdf - 8);
  const maxH = Math.max(14, args.fieldHeightPdf - 6);
  const { imageWidthPx: iw, imageHeightPx: ih } = args;
  if (iw <= 0 || ih <= 0) {
    return { x: args.fieldXPdf + padX, y: args.fieldYPdf + padY, width: maxW * 0.5, height: maxH * 0.35 };
  }
  const sx = maxW / iw;
  const sy = maxH / ih;
  const s = Math.min(sx, sy);
  const dw = iw * s;
  const dh = ih * s;
  const x = args.fieldXPdf + padX;
  const yBottom = args.fieldYPdf + padY;
  return { x, y: yBottom, width: dw, height: dh };
}
