import {
  salesAgentMayAccessWorkspacePath,
  SALES_AGENT_ORDERS_BASE,
} from "@/lib/sales-agent/sales-agent-workspace-paths";

/** Default in-app path after sign-in when no safe `next` target is provided. */
export const DEFAULT_POST_LOGIN_PATH = "/workspace/phone/keypad";

export function postLoginPathForRole(role: string | null | undefined): string {
  const r = typeof role === "string" ? role.trim() : "";
  if (r === "sales_agent") return SALES_AGENT_ORDERS_BASE;
  if (r) return DEFAULT_POST_LOGIN_PATH;
  return DEFAULT_POST_LOGIN_PATH;
}

export function safeInternalPath(next: string | null, role?: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) {
    return postLoginPathForRole(role);
  }
  const r = typeof role === "string" ? role.trim() : "";
  if (r === "sales_agent") {
    if (next.startsWith("/admin")) return postLoginPathForRole(r);
    if (next.startsWith("/workspace") && !salesAgentMayAccessWorkspacePath(next)) {
      return postLoginPathForRole(r);
    }
    if (next.startsWith("/sales-agent")) return postLoginPathForRole(r);
  }
  return next;
}
