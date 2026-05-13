/**
 * Shared PDF field ↔ screen overlay math for template editor, admin send, and recipient signing.
 * PDF storage uses bottom-left origin (pdf-lib / PDF user space). Overlays use top-left CSS.
 * Final flattened positions for server-side renders use `pdf-render-field-placement.ts` + `render-pdf.ts`
 * — keep rects consistent with `{ x, y, width, height }` here.
 */

export type PdfRectPdfSpace = {
  /** Page width in PDF points (from rendered page viewport at scale 1). */
  pdfPageWidthPt: number;
  pdfPageHeightPt: number;
  /** Field rect in PDF user space (x,y = lower-left corner). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Rendered page width in CSS pixels (must match canvas CSS width). */
  displayPageWidthPx: number;
};

/**
 * Returns overlay position/size in **local coordinates** relative to the page container
 * (same width as the canvas / display width).
 */
export function pdfFieldRectToOverlayCssPx(input: PdfRectPdfSpace): {
  left: number;
  top: number;
  width: number;
  height: number;
} {
  const scale = input.displayPageWidthPx / input.pdfPageWidthPt;
  return {
    left: input.x * scale,
    top: (input.pdfPageHeightPt - (input.y + input.height)) * scale,
    width: input.width * scale,
    height: input.height * scale,
  };
}
