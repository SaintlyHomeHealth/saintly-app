/** Sales Agent portal home (orders dashboard). */
export const SALES_AGENT_ORDERS_BASE = "/workspace/phone/sales-agent/leads";

export const SALES_AGENT_ORDERS_NEW = `${SALES_AGENT_ORDERS_BASE}/new`;

export const SALES_AGENT_CHAT = "/workspace/phone/sales-agent/chat";

export function salesAgentLeadDetailPath(leadId: string): string {
  return `${SALES_AGENT_ORDERS_BASE}/${encodeURIComponent(leadId)}`;
}

/** Manager workspace chat thread with a sales agent. */
export function salesAgentWorkspaceChatThreadPath(agentUserId: string): string {
  return `/workspace/phone/chat/sales-agent/${encodeURIComponent(agentUserId)}`;
}

export type SalesAgentPaths = {
  leads: string;
  newLead: string;
  chat: string;
  leadDetail: (leadId: string) => string;
};

export const DEFAULT_SALES_AGENT_PATHS: SalesAgentPaths = {
  leads: SALES_AGENT_ORDERS_BASE,
  newLead: SALES_AGENT_ORDERS_NEW,
  chat: SALES_AGENT_CHAT,
  leadDetail: salesAgentLeadDetailPath,
};

/** Legacy standalone portal paths (redirected to workspace). */
export const LEGACY_SALES_AGENT_ORDERS_BASE = "/sales-agent/leads";

const SALES_AGENT_ALLOWED_PREFIXES = ["/workspace/phone/sales-agent"] as const;

export function salesAgentMayAccessWorkspacePath(pathname: string): boolean {
  if (!pathname.startsWith("/workspace/phone")) return false;
  return SALES_AGENT_ALLOWED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function mapLegacySalesAgentPath(pathname: string): string | null {
  if (!pathname.startsWith("/sales-agent")) return null;
  if (pathname.startsWith("/sales-agent/chat")) {
    return pathname.replace("/sales-agent/chat", SALES_AGENT_CHAT);
  }
  return pathname.replace("/sales-agent", "/workspace/phone/sales-agent");
}
