import "server-only";

/** Set SALES_AGENT_CHAT_DEBUG=1 for temporary server-side thread/send diagnostics (no PHI in logs by default). */
export function salesAgentChatDebugEnabled(): boolean {
  return process.env.SALES_AGENT_CHAT_DEBUG === "1";
}

export function salesAgentChatDebugLog(msg: string, detail?: Record<string, unknown>): void {
  if (!salesAgentChatDebugEnabled()) return;
  console.info(`[sales-agent/chat] ${msg}`, detail ?? "");
}
