import {
  formatLeadContactOutcomeLabel,
  formatLeadContactTypeLabel,
} from "@/lib/crm/lead-contact-outcome";
import { formatFollowUpDate } from "@/lib/crm/crm-leads-table-helpers";
import { getCrmCalendarDateIsoFromInstant, getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import { buildUnifiedLeadTimeline, type LeadActivityRow } from "@/lib/crm/lead-activities-timeline";

import { LeadActivityThread } from "./LeadActivityThread";
import { LeadQuickNoteForm } from "./LeadQuickNoteForm";

function formatFollowUpDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const datePart = d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const timePart = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${datePart} at ${timePart}`;
}

function followUpLabel(iso: string): "overdue" | "today" | "upcoming" | "none" {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "none";
  const today = getCrmCalendarTodayIso();
  if (iso < today) return "overdue";
  if (iso === today) return "today";
  return "upcoming";
}

type StaffOpt = {
  user_id: string;
  email: string | null;
  full_name: string | null;
};

function staffLabelFromMap(map: Map<string, StaffOpt>, userId: string | null | undefined): string {
  if (!userId?.trim()) return "System";
  const s = map.get(userId.trim());
  const name = (s?.full_name ?? "").trim();
  if (name) return name;
  const em = (s?.email ?? "").trim();
  if (em) return em;
  return `${userId.slice(0, 8)}…`;
}

export function LeadFollowUpContextPanel(props: {
  leadId: string;
  activities: LeadActivityRow[];
  staffOptions: StaffOpt[];
  lastContactAt: string | null;
  lastOutcome: string | null;
  lastNote: string | null;
  lastContactType: string | null;
  leadCreatedAt: string | null;
  applicationNotes: string;
  followUpIso: string;
  nextActionVal: string;
  followUpAtIso: string | null;
}) {
  const staffById = new Map(props.staffOptions.map((s) => [s.user_id, s]));

  const authorLabels: Record<string, string> = {};
  for (const s of props.staffOptions) {
    authorLabels[s.user_id] = staffLabelFromMap(staffById, s.user_id);
  }
  for (const a of props.activities) {
    const uid = typeof a.created_by_user_id === "string" ? a.created_by_user_id.trim() : "";
    if (uid && authorLabels[uid] === undefined) {
      authorLabels[uid] = staffLabelFromMap(staffById, uid);
    }
  }

  const timeline = buildUnifiedLeadTimeline({
    activities: props.activities,
    lastNote: props.lastNote,
    applicationNotes: props.applicationNotes,
    leadCreatedAt: props.leadCreatedAt,
  });

  const followUpDateForBadge = props.followUpAtIso
    ? getCrmCalendarDateIsoFromInstant(new Date(props.followUpAtIso))
    : props.followUpIso;
  const fu = followUpLabel(followUpDateForBadge);

  const lastContactSummary =
    props.lastContactAt?.trim() && !Number.isNaN(Date.parse(props.lastContactAt)) ? (
      <p className="text-[11px] text-slate-400">
        Last outcome: {formatLeadContactTypeLabel(props.lastContactType)} ·{" "}
        {formatLeadContactOutcomeLabel(props.lastOutcome)}
      </p>
    ) : (
      <p className="text-[11px] text-slate-400">No logged call or text on this lead yet.</p>
    );

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200/70 bg-white/90 p-4 shadow-sm">
        <p className="text-xs font-medium text-slate-600">Conversation</p>
        {lastContactSummary}
        <div className="mt-3 max-h-[min(70vh,36rem)] overflow-y-auto pr-0.5">
          {timeline.length === 0 ? (
            <p className="text-sm text-slate-600">No activity yet.</p>
          ) : (
            <LeadActivityThread leadId={props.leadId} items={timeline} authorLabels={authorLabels} />
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm ring-1 ring-slate-100/80">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Next follow-up</p>
        {props.followUpAtIso ? (
          <>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <p className="text-lg font-semibold tabular-nums text-slate-900">{formatFollowUpDateTime(props.followUpAtIso)}</p>
              {fu === "overdue" ? (
                <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-900">Overdue</span>
              ) : fu === "today" ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950">Due today</span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Upcoming</span>
              )}
            </div>
          </>
        ) : props.followUpIso ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold tabular-nums text-slate-900">{formatFollowUpDate(props.followUpIso)}</p>
            {fu === "overdue" ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-900">Overdue</span>
            ) : fu === "today" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950">Due today</span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">Upcoming</span>
            )}
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-600">No follow-up date set.</p>
        )}
        {props.nextActionVal ? (
          <p className="mt-2 text-xs text-slate-600">
            Next action:{" "}
            <span className="font-medium text-slate-800">{formatLeadNextActionLabel(props.nextActionVal)}</span>
          </p>
        ) : null}
      </div>

      <div className="rounded-2xl border border-slate-200/90 bg-slate-50/80 p-4 shadow-sm ring-1 ring-slate-100/80">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Quick note</p>
        <p className="mt-0.5 text-xs text-slate-500">Saved to the thread immediately.</p>
        <div className="mt-3">
          <LeadQuickNoteForm leadId={props.leadId} />
        </div>
      </div>
    </div>
  );
}
