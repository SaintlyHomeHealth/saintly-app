/**
 * Single source of truth for `/api/upload-applicant-file` document types and MIME allowlists.
 */

export const APPLICANT_FILE_UPLOAD_ALLOWED_DOCUMENT_TYPES = [
  'auto_insurance',
  'background_check',
  'cpr_card',
  'cpr_front',
  'drivers_license',
  'fingerprint_clearance_card',
  'independent_contractor_insurance',
  'oig_check',
  'resume',
  'social_security_card',
  'tb_test',
] as const

export type ApplicantFileUploadDocumentType =
  (typeof APPLICANT_FILE_UPLOAD_ALLOWED_DOCUMENT_TYPES)[number]

export const APPLICANT_FILE_UPLOAD_ACCEPTED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
] as const

export function normalizeApplicantUploadDocumentType(value: string) {
  return value.toLowerCase().trim().replace(/[\s-]+/g, '_')
}

export function isAllowedApplicantUploadDocumentType(
  value: string
): value is ApplicantFileUploadDocumentType {
  const n = normalizeApplicantUploadDocumentType(value)
  return (APPLICANT_FILE_UPLOAD_ALLOWED_DOCUMENT_TYPES as readonly string[]).includes(n)
}

/** User-facing line for upload cards */
export function getApplicantUploadAcceptedFormatsHint() {
  return 'Accepted file types: PDF, JPEG, PNG, WEBP, HEIC (maximum 10 MB per file).'
}

export function formatMimeTypeForError(mime: string) {
  const m = (mime || '').trim()
  return m || '(empty or unknown — try PDF or a standard photo export)'
}

const EXT_TO_MIME: Record<string, (typeof APPLICANT_FILE_UPLOAD_ACCEPTED_MIME_TYPES)[number]> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
}

/** When `File.type` is empty or generic, infer from extension (common on mobile pickers). */
export function inferApplicantUploadMimeFromFileName(fileName: string): string | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (!ext) return null
  return EXT_TO_MIME[ext] ?? null
}

const ALLOWED_MIME_ARR = APPLICANT_FILE_UPLOAD_ACCEPTED_MIME_TYPES as readonly string[]

/** Resolves MIME for validation and storage (matches upload route behavior). */
export function getEffectiveApplicantUploadMime(file: Pick<File, 'type' | 'name'>) {
  const rawMime = (file.type || '').trim()
  const inferred = inferApplicantUploadMimeFromFileName(file.name)

  if (rawMime && ALLOWED_MIME_ARR.includes(rawMime)) return rawMime
  if (
    (rawMime === 'application/octet-stream' || !rawMime) &&
    inferred &&
    ALLOWED_MIME_ARR.includes(inferred)
  ) {
    return inferred
  }
  if (inferred && ALLOWED_MIME_ARR.includes(inferred)) return inferred
  return rawMime || inferred || ''
}
