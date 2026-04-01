const PREFIX = "saintly_";

export function softphoneTwilioClientIdentity(userId: string): string {
  const id = userId.trim();
  if (!id) {
    throw new Error("userId is required");
  }
  return `${PREFIX}${id}`;
}

/**
 * Parse `client:saintly_<uuid>` from Twilio Voice webhook `From` param.
 */
export function parseStaffUserIdFromTwilioClientFrom(fromParam: string | null | undefined): string | null {
  const from = (fromParam ?? "").trim();
  if (!from.toLowerCase().startsWith("client:")) {
    return null;
  }
  const identity = from.slice("client:".length).trim();
  if (!identity.startsWith(PREFIX)) {
    return null;
  }
  const uuid = identity.slice(PREFIX.length).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(uuid)) {
    return null;
  }
  return uuid.toLowerCase();
}
