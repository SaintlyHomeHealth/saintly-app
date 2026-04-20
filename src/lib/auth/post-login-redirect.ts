/** Default in-app path after sign-in when no safe `next` target is provided. */
export const DEFAULT_POST_LOGIN_PATH = "/workspace/phone/keypad";

export function safeInternalPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return DEFAULT_POST_LOGIN_PATH;
  }
  return next;
}
