/** Default in-app path after sign-in when no safe `next` target is provided. */
export const DEFAULT_POST_LOGIN_PATH = "/workspace/phone/keypad";

export function postLoginPathForRole(role: string | null | undefined): string {
  const r = typeof role === "string" ? role.trim() : "";
  if (r === "sales_agent") return "/sales-agent/leads";
  if (r) return DEFAULT_POST_LOGIN_PATH;
  return DEFAULT_POST_LOGIN_PATH;
}

export function safeInternalPath(next: string | null, role?: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return postLoginPathForRole(role);
  }
  const r = typeof role === "string" ? role.trim() : "";
  if (r === "sales_agent" && (next.startsWith("/admin") || next.startsWith("/workspace"))) {
    return postLoginPathForRole(r);
  }
  return next;
}
