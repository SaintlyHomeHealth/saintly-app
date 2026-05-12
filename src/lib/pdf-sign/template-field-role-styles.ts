/**
 * PDF Sign · template editor field chrome (recipient vs sender).
 *
 * Always derive the role key with `normalizeSignerRole(field.signer_role)` (or equivalent)
 * — never branch on legacy CRM-style roles like "employee" / "company" here.
 */

import type { PdfSignCanonicalSignerRole } from "@/lib/pdf-sign/normalize";

/** Canonical party → Tailwind tokens used only in the template field editor UI. */
export const PDF_SIGN_TEMPLATE_FIELD_ROLE_TAILWIND = {
  recipient: {
    /** Solid field on PDF (accepted / manually placed). */
    overlayConfirmed: "border-emerald-600 bg-emerald-50/45 text-emerald-950",
    /** Fill/text under dashed “suggestion” chrome (border stays amber below). */
    overlaySuggestionTint: "bg-emerald-50/55 text-emerald-950",
    resizeHandleBorder: "border-emerald-600",
    resizeHandleRing: "ring-emerald-300",
    rolePill: "bg-emerald-100 text-emerald-900",
    listAccentBorder: "border-l-emerald-500",
    panelAccentBorder: "border-l-[3px] border-emerald-500",
  },
  sender: {
    overlayConfirmed: "border-violet-600 bg-violet-50/45 text-violet-950",
    overlaySuggestionTint: "bg-violet-50/55 text-violet-950",
    resizeHandleBorder: "border-violet-600",
    resizeHandleRing: "ring-violet-300",
    rolePill: "bg-violet-100 text-violet-900",
    listAccentBorder: "border-l-violet-500",
    panelAccentBorder: "border-l-[3px] border-violet-500",
  },
} as const satisfies Record<
  PdfSignCanonicalSignerRole,
  Record<string, string>
>;

export function pdfSignTemplateFieldRoleChrome(role: PdfSignCanonicalSignerRole) {
  return PDF_SIGN_TEMPLATE_FIELD_ROLE_TAILWIND[role];
}

/**
 * Overlay box on the PDF: suggestion state keeps dashed amber border; role selects fill.
 * Selection adds an indigo ring so role fill remains visible.
 */
export function pdfSignTemplateFieldOverlayClassNames(args: {
  canonicalRole: PdfSignCanonicalSignerRole;
  isSuggestion: boolean;
  isSelected: boolean;
}): string {
  const c = pdfSignTemplateFieldRoleChrome(args.canonicalRole);
  const ring = args.isSelected ? "ring-2 ring-indigo-400 ring-offset-0 " : "";
  if (args.isSuggestion) {
    return `${ring}border-2 border-dashed border-amber-500 ${c.overlaySuggestionTint}`;
  }
  return `${ring}border-2 ${c.overlayConfirmed}`;
}
