/** Workspace Phone home for sales agents (orders dashboard). */
export const SALES_AGENT_ORDERS_BASE = "/workspace/phone/sales-agent/leads";

export const SALES_AGENT_ORDERS_NEW = `${SALES_AGENT_ORDERS_BASE}/new`;

export function salesAgentLeadDetailPath(leadId: string): string {
  return `${SALES_AGENT_ORDERS_BASE}/${encodeURIComponent(leadId)}`;
}

export type SalesAgentPaths = {
  leads: string;
  newLead: string;
  leadDetail: (leadId: string) => string;
};

export const DEFAULT_SALES_AGENT_PATHS: SalesAgentPaths = {
  leads: SALES_AGENT_ORDERS_BASE,
  newLead: SALES_AGENT_ORDERS_NEW,
  leadDetail: salesAgentLeadDetailPath,
};

/** Legacy standalone portal paths (redirected to workspace). */
export const LEGACY_SALES_AGENT_ORDERS_BASE = "/sales-agent/leads";

const SALES_AGENT_WORKSPACE_PHONE_PREFIXES = [
  "/workspace/phone/sales-agent",
  "/workspace/phone/keypad",
  "/workspace/phone/calls",
  "/workspace/phone/voicemail",
] as const;

export function salesAgentMayAccessWorkspacePath(pathname: string): boolean {
  if (!pathname.startsWith("/workspace/phone")) return false;
  return SALES_AGENT_WORKSPACE_PHONE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export function mapLegacySalesAgentPath(pathname: string): string | null {
  if (!pathname.startsWith("/sales-agent")) return null;
  return pathname.replace("/sales-agent", "/workspace/phone/sales-agent");
}
