import { redirect } from "next/navigation";

import { CrmTasksPageClient } from "@/app/admin/crm/tasks/crm-tasks-page-client";
import { loadAssignableLeadOwners } from "@/lib/crm/assignable-lead-owners";
import type { CrmTaskListTab, CrmTaskPriority } from "@/lib/crm/crm-task-types";
import { listCrmTasks } from "@/lib/crm/crm-tasks-operations";
import { requireCrmTasksStaff } from "@/lib/crm/require-crm-tasks-staff";
import { getSaintlyCrmVoicePhiNotice } from "@/lib/crm/crm-voice-phi-notice.server";
import { getSaintlyRealtimeGatewayClientSnapshot } from "@/lib/crm/saintly-ai-voice-config";

function parseTab(raw: string | undefined): CrmTaskListTab {
  const t = (raw ?? "").trim();
  const allowed = new Set<CrmTaskListTab>(["open", "due_today", "overdue", "completed", "all"]);
  return allowed.has(t as CrmTaskListTab) ? (t as CrmTaskListTab) : "open";
}

function parsePriority(raw: string | undefined): CrmTaskPriority | "" {
  const p = (raw ?? "").trim();
  if (p === "low" || p === "normal" || p === "high" || p === "urgent") return p;
  return "";
}

export default async function CrmTasksPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const gate = await requireCrmTasksStaff();
  if (!gate.ok) {
    redirect("/admin");
  }

  const sp = searchParams ? await searchParams : {};
  const tab = parseTab(typeof sp.tab === "string" ? sp.tab : Array.isArray(sp.tab) ? sp.tab[0] : "");
  const q =
    typeof sp.q === "string"
      ? sp.q
      : Array.isArray(sp.q)
        ? sp.q[0] ?? ""
        : "";
  const priority = parsePriority(
    typeof sp.priority === "string" ? sp.priority : Array.isArray(sp.priority) ? sp.priority[0] : ""
  );
  const leadPinRaw =
    typeof sp.lead === "string"
      ? sp.lead.trim()
      : Array.isArray(sp.lead)
        ? (typeof sp.lead[0] === "string" ? sp.lead[0].trim() : "")
        : "";
  const pinned_lead_id =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadPinRaw)
      ? leadPinRaw
      : "";

  const lr = await listCrmTasks({
    tab,
    search: q.trim() || "",
    priority: priority === "" ? null : priority,
    pinned_lead_id: pinned_lead_id || null,
  });
  const rows = lr.ok ? lr.tasks : [];

  const staffRows = await loadAssignableLeadOwners();
  const realtimeGateway = getSaintlyRealtimeGatewayClientSnapshot();
  const voicePhiNotice = getSaintlyCrmVoicePhiNotice();

  return (
    <CrmTasksPageClient
      initialTasks={rows}
      staffOptions={staffRows}
      realtimeGateway={realtimeGateway}
      voicePhiNotice={voicePhiNotice}
      tab={tab}
      searchInitial={typeof q === "string" ? q : ""}
      priorityInitial={priority}
      pinnedLeadId={pinned_lead_id || null}
    />
  );
}
