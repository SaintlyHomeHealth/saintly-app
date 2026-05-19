import { redirect } from "next/navigation";

import { salesAgentLeadDetailPath } from "@/lib/sales-agent/sales-agent-workspace-paths";

export default async function SalesAgentLeadDetailRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ leadId: string }>;
  searchParams: Promise<{ created?: string; uploaded?: string }>;
}) {
  const { leadId } = await params;
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.created === "1") qs.set("created", "1");
  if (sp.uploaded === "1") qs.set("uploaded", "1");
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  redirect(`${salesAgentLeadDetailPath(leadId)}${suffix}`);
}
