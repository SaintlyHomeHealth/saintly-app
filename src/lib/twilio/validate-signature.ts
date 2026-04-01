import crypto from "crypto";

/**
 * Validates X-Twilio-Signature per Twilio webhook security (POST body key/value pairs).
 * @param fullUrl Exact webhook URL Twilio POSTed to (scheme + host + path, no trailing slash unless Twilio uses one)
 */
export function validateTwilioWebhookSignature(
  authToken: string,
  signature: string | null | undefined,
  fullUrl: string,
  bodyParams: Record<string, string>
): boolean {
  if (!signature || !authToken) return false;

  const sortedKeys = Object.keys(bodyParams).sort();
  let data = fullUrl;
  for (const key of sortedKeys) {
    data += key + bodyParams[key];
  }

  const expected = crypto.createHmac("sha1", authToken).update(data, "utf8").digest("base64");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature.trim(), "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
