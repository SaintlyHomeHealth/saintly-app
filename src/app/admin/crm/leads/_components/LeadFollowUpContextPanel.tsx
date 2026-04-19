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
  lastNote: string | null;
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

  const today = getCrmCalendarTodayIso();
  const overdue =
    followUpDateForBadge &&
    /^\d{4}-\d{2}-\d{2}$/.test(followUpDateForBadge) &&
    followUpDateForBadge < today;

  const followUpLine = props.followUpAtIso
    ? `Lead next follow-up: ${formatFollowUpDateTime(props.followUpAtIso)}${overdue ? " · Overdue" : ""}`
    : props.followUpIso && /^\d{4}-\d{2}-\d{2}/.test(props.followUpIso)
      ? `Lead next follow-up: ${formatFollowUpDate(props.followUpIso)}${overdue ? " · Overdue" : ""}`
      : null;

  const nextActionLine = props.nextActionVal?.trim()
    ? `Next action: ${formatLeadNextActionLabel(props.nextActionVal)}`
    : null;

  return (
    <div className="flex h-full min-h-[min(70vh,36rem)] flex-col overflow-hidden rounded-2xl border border-slate-200/70 bg-slate-100/80">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <LeadActivityThread
          leadId={props.leadId}
          items={timeline}
          authorLabels={authorLabels}
          currentFollowUpLine={followUpLine}
          currentNextActionLine={nextActionLine}
        />
      </div>
      <div className="shrink-0 border-t border-slate-200/80 bg-white/95 p-2 backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <LeadQuickNoteForm leadId={props.leadId} />
      </div>
    </div>
  );
}
