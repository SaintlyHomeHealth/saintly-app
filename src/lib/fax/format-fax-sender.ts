const FAX_NUMBER_DISPLAY_MAP: Record<string, string> = {
  "+14808087157": "Saintly Home Health",
  "4808087157": "Saintly Home Health",
};

export function formatFaxSenderDisplay(phone: string | null, detectedName?: string | null) {
  if (!phone) return "Unknown";

  const normalized = phone.replace(/\D/g, "");

  if (detectedName && detectedName.trim().length > 2) {
    return detectedName.trim();
  }

  if (FAX_NUMBER_DISPLAY_MAP[normalized]) {
    return FAX_NUMBER_DISPLAY_MAP[normalized];
  }

  if (FAX_NUMBER_DISPLAY_MAP[`+1${normalized}`]) {
    return FAX_NUMBER_DISPLAY_MAP[`+1${normalized}`];
  }

  return phone;
}
