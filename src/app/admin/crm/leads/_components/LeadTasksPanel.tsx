"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { buildCrmTasksListHref } from "@/app/admin/crm/tasks/crm-tasks-page-client";
import { completeCrmTaskAction, reopenCrmTaskAction } from "@/app/admin/crm/tasks/actions";
import type { CrmTaskRow } from "@/lib/crm/crm-task-types";
import type { SaintlyRealtimeGatewayClientSnapshot } from "@/lib/crm/saintly-ai-voice-config";
import { SAINTLY_CRM_VOICE_PHI_OPENAI_NOTICE } from "@/lib/crm/crm-voice-phi-copy";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

import { AiVoiceTaskButton } from "@/components/admin/crm/AiVoiceTaskButton";
import { SaintlyRealtimeAssistant } from "@/components/admin/crm/SaintlyRealtimeAssistant";

export function LeadTasksPanel(input: {
  leadId: string;
  tasks: CrmTaskRow[];
  crmRealtimeGateway: SaintlyRealtimeGatewayClientSnapshot;
}) {
  const router = useRouter();
  const [, start] = useTransition();

  const refresh = () => router.refresh();

  const toggleDone = async (t: CrmTaskRow, next: boolean) => {
    start(async () => {
      const r = next ? await completeCrmTaskAction(t.id) : await reopenCrmTaskAction(t.id);
      if (r.ok) router.refresh();
    });
  };

  const leadTasksHref = buildCrmTasksListHref({ tab: "open", pinnedLeadId: input.leadId });

  return (
    <section className="mt-6 rounded-[20px] border border-slate-200 bg-white p-4 shadow-sm lg:mt-4">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Open tasks · this lead</h3>
          <p className="mt-0.5 text-xs text-slate-500">Showing up to 10 open reminders for this page load.</p>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/admin/crm/tasks`}
            className="rounded-lg border border-sky-700 bg-white px-3 py-2 text-xs font-semibold text-sky-900 shadow-sm hover:bg-sky-50"
          >
            New Task
          </Link>
          <AiVoiceTaskButton variant="compact" relatedEntityType="lead" relatedEntityId={input.leadId} onAfterSave={refresh} />
          <SaintlyRealtimeAssistant gateway={input.crmRealtimeGateway} sessionContext={{ lead_id: input.leadId }} />
          <Link
            href={leadTasksHref}
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50"
          >
            View on Tasks page
          </Link>
        </div>
        <p className="text-[11px] leading-snug text-amber-950">{SAINTLY_CRM_VOICE_PHI_OPENAI_NOTICE}</p>
      </div>
      <ul className="mt-3 divide-y divide-slate-100 text-sm">
        {input.tasks.length === 0 ? (
          <li className="py-4 text-xs text-slate-500">No open tasks linked to this lead.</li>
        ) : (
          input.tasks.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
              <input
                type="checkbox"
                aria-label={`Complete ${t.title}`}
                checked={t.status === "done"}
                onChange={(e) => void toggleDone(t, e.target.checked)}
                className="shrink-0"
              />
              <span className="min-w-0 flex-1 font-medium text-slate-900">{t.title}</span>
              <span className="text-xs text-slate-600">{t.due_at ? formatAppDateTime(t.due_at) : "No due"}</span>
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-700">
                {t.priority}
              </span>
            </li>
          ))
        )}
      </ul>
    </section>
  );
}
