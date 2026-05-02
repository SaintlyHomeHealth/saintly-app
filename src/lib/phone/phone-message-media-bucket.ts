/** Private bucket — PHI-eligible MMS (e.g. insurance card photos); access via guarded API routes. */
export const PHONE_MESSAGE_MEDIA_BUCKET = "phone-message-media";

/** Hard cap after download headers (prevent runaway MMS). */
export const PHONE_MESSAGE_MMS_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024;
