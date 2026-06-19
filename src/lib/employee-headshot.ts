/** Shared copy and document type for employee professional headshots. */

export const HEADSHOT_DOCUMENT_TYPE = "headshot" as const;

export const HEADSHOT_UPLOAD_LABEL = "Professional Headshot";

export const HEADSHOT_UPLOAD_HELPER_TEXT =
  "Upload a clear front-facing headshot. This will be used for identity verification, background check support, and your Saintly employee badge.";

export const HEADSHOT_MISSING_STATUS =
  "Headshot missing — needed for background check support and badge.";

export const HEADSHOT_COMPLETE_STATUS = "Headshot uploaded.";

export const HEADSHOT_IMAGE_ACCEPT =
  ".jpg,.jpeg,.png,.webp,.heic,.heif,image/jpeg,image/png,image/webp,image/heic,image/heif";

export function getEmployeeInitials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}

export function applicantHeadshotViewUrl(applicantId: string, inline = true): string {
  const base = `/api/applicant-file-view?applicantId=${encodeURIComponent(applicantId)}&documentType=${HEADSHOT_DOCUMENT_TYPE}`;
  return inline ? `${base}&inline=1` : base;
}

export function adminHeadshotViewUrl(recordId: string, inline = true): string {
  const base = `/api/admin/employee-documents/download?recordId=${encodeURIComponent(recordId)}&source=applicant_file`;
  return inline ? `${base}&inline=1` : base;
}
