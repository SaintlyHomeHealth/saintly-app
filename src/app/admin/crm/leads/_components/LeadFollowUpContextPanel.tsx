import {
  formatLeadContactOutcomeLabel,
  formatLeadContactTypeLabel,
} from "@/lib/crm/lead-contact-outcome";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import { formatFollowUpDate } from "@/lib/crm/crm-leads-table-helpers";
import { getCrmCalendarTodayIso } from "@/lib/crm/crm-local-date";

import { LeadQuickNoteForm } from "./LeadQuickNoteForm";

type TimelineRow = {
  id: string;
  sortMs: number;
  title: string;
  meta: string;
  body: string | null;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function followUpLabel(iso: string): "overdue" | "today" | "upcoming" | "none" {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "none";
  const today = getCrmCalendarTodayIso();
  if (iso < today) return "overdue";
  if (iso === today) return "today";
  return "upcoming";
}

function buildTimelineRows(props: {
  lastContactAt: string | null;
  lastOutcome: string | null;
  lastNote: string | null;
  lastContactType: string | null;
  leadCreatedAt: string | null;
  applicationNotes: string;
}): TimelineRow[] {
  const rows: TimelineRow[] = [];

  if (props.lastContactAt && props.lastContactAt.trim()) {
    const ms = new Date(props.lastContactAt).getTime();
    if (!Number.isNaN(ms)) {
      const typeLbl = formatLeadContactTypeLabel(props.lastContactType);
      const outLbl = formatLeadContactOutcomeLabel(props.lastOutcome);
      rows.push({
        id: "last-contact",
        sortMs: ms,
        title: "Contact attempt",
        meta: `${formatDateTime(props.lastContactAt)} · ${typeLbl} · ${outLbl}`,
        body: (props.lastNote ?? "").trim() || null,
      });
    }
  }

  const createdMs =
    props.leadCreatedAt && props.leadCreatedAt.trim()
      ? new Date(props.leadCreatedAt).getTime()
      : Number.NaN;

  if (props.applicationNotes.trim()) {
    const sortMs = !Number.isNaN(createdMs) ? createdMs + 1 : Date.now();
    rows.push({
      id: "lead-notes",
      sortMs,
      title: "Lead record notes",
      meta:
        !Number.isNaN(createdMs) && props.leadCreatedAt
          ? `On file · since ${formatDateTime(props.leadCreatedAt)}`
          : "On file",
      body: props.applicationNotes.trim(),
    });
  }

  if (!Number.isNaN(createdMs) && props.leadCreatedAt) {
    rows.push({
      id: "created",
      sortMs: createdMs,
      title: "Lead created",
      meta: formatDateTime(props.leadCreatedAt),
      body: null,
    });
  }

  rows.sort((a, b) => b.sortMs - a.sortMs);
  return rows;
}

export function LeadFollowUpContextPanel(props: {
  leadId: string;
  lastContactAt: string | null;
  lastOutcome: string | null;
  lastNote: string | null;
  lastContactType: string | null;
  leadCreatedAt: string | null;
  applicationNotes: string;
  followUpIso: string;
  nextActionVal: string;
}) {
  const fu = followUpLabel(props.followUpIso);
  const timeline = buildTimelineRows(props);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/90 to-white p-4 shadow-sm ring-1 ring-slate-100">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Last contact</p>
        <p className="mt-1 text-xs font-medium text-slate-500">Where we left off</p>
        {props.lastContactAt ? (
          <>
            <p className="mt-3 text-sm font-semibold text-slate-900">{formatDateTime(props.lastContactAt)}</p>
            <p className="mt-1 text-xs text-slate-600">
              {formatLeadContactTypeLabel(props.lastContactType)} · {formatLeadContactOutcomeLabel(props.lastOutcome)}
            </p>
            {(props.lastNote ?? "").trim() ? (
              <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-slate-100 bg-white p-3 text-sm leading-relaxed text-slate-800">
                <p className="whitespace-pre-wrap break-words">{(props.lastNote ?? "").trim()}</p>
              </div>
            ) : (
              <p className="mt-3 text-sm italic text-slate-500">No notes on this contact yet.</p>
            )}
          </>
        ) : (
          <p className="mt-3 text-sm text-slate-600">No contact attempts logged yet.</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Activity</p>
        <p className="mt-0.5 text-xs text-slate-500">Newest first · from saved lead fields</p>
        {timeline.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">No history yet.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {timeline.map((row) => (
              <li key={row.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <p className="text-xs font-semibold text-slate-900">{row.title}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">{row.meta}</p>
                {row.body ? (
                  <p className="mt-2 line-clamp-6 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">
                    {row.body}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Next follow-up</p>
        {props.followUpIso ? (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <p className="text-lg font-semibold tabular-nums text-slate-900">{formatFollowUpDate(props.followUpIso)}</p>
            {fu === "overdue" ? (
              <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-900">
                Overdue
              </span>
            ) : fu === "today" ? (
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-950">
                Due today
              </span>
            ) : (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                Upcoming
              </span>
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

      <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 shadow-sm">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Quick note</p>
        <p className="mt-0.5 text-xs text-slate-500">Appends to the contact log (same field as outcomes).</p>
        <div className="mt-3">
          <LeadQuickNoteForm leadId={props.leadId} />
        </div>
      </div>
    </div>
  );
}
