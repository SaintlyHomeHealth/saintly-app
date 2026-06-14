/** Storage bucket for facility outreach photos. */
export const FACILITY_PHOTOS_BUCKET = "facility-photos";

/** Max upload size per photo (10 MB). */
export const FACILITY_PHOTO_MAX_BYTES = 10 * 1024 * 1024;

/** Max photos per upload request. */
export const FACILITY_PHOTO_MAX_FILES = 6;

export const FACILITY_PHOTO_TYPES = [
  "swag_bag",
  "postcards",
  "business_card",
  "building_sign",
  "front_desk",
  "referral_packet",
  "fax_request",
  "document",
  "other",
] as const;

export type FacilityPhotoType = (typeof FACILITY_PHOTO_TYPES)[number];

const PHOTO_TYPE_SET = new Set<string>(FACILITY_PHOTO_TYPES);

export function isFacilityPhotoType(v: string): v is FacilityPhotoType {
  return PHOTO_TYPE_SET.has(v);
}

export const FACILITY_PHOTO_TYPE_LABELS: Record<FacilityPhotoType, string> = {
  swag_bag: "Swag bag",
  postcards: "Postcards",
  business_card: "Business card",
  building_sign: "Building sign",
  front_desk: "Front desk",
  referral_packet: "Referral packet",
  fax_request: "Fax request",
  document: "Document",
  other: "Other",
};

const MIME_ALLOW = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

export function isAllowedFacilityPhotoMime(mime: string): boolean {
  const t = mime.trim().toLowerCase();
  if (!t) return false;
  if (MIME_ALLOW.has(t)) return true;
  return t.startsWith("image/");
}

export function facilityPhotoTypeLabel(type: string | null | undefined): string {
  if (!type) return "Photo";
  if (isFacilityPhotoType(type)) return FACILITY_PHOTO_TYPE_LABELS[type];
  return type.replace(/_/g, " ");
}
