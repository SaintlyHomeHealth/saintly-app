import { redirect } from "next/navigation";

import { SALES_AGENT_ORDERS_NEW } from "@/lib/sales-agent/sales-agent-workspace-paths";

export default function SalesAgentNewLeadPage() {
  redirect(SALES_AGENT_ORDERS_NEW);
}
