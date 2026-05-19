import { redirect } from "next/navigation";

import { SALES_AGENT_ORDERS_BASE } from "@/lib/sales-agent/sales-agent-workspace-paths";

export default function WorkspaceSalesAgentIndexPage() {
  redirect(SALES_AGENT_ORDERS_BASE);
}
