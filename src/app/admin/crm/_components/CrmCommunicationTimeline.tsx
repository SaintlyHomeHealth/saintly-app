"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { CommunicationTimelineRow } from "@/lib/crm/build-crm-communication-timeline-model";
import { formatAdminPhoneWhen } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { buildWorkspaceInboxLeadSmsHref } from "@/lib/workspace-phone/launch-urls";

export type CommTimelineFilter = "all" | "sms" | "calls" | "notes";

function filterRows(rows: CommunicationTimelineRow[], f: CommTimelineFilter): CommunicationTimelineRow[] {
  if (f === "all") return rows;
  if (f === "sms") return rows.filter((r) => r.kind === "sms");
  if (f === "calls") return rows.filter((r) => r.kind === "call");
  if (f === "notes") return rows.filter((r) => r.kind === "note");
  return rows;
}

const TAB_CLS =
  "rounded-full px-3 py-1 text-xs font-semibold transition-colors border border-transparent";
const TAB_ACTIVE = "bg-slate-900 text-white";
const TAB_IDLE = "bg-slate-100 text-slate-700 hover:bg-slate-200/90";

export function CrmCommunicationTimeline(props: {
  rows: CommunicationTimelineRow[];
  leadId?: string | null;
  emptyHint?: string;
}) {
  const { rows, leadId, emptyHint } = props;
  const [filter, setFilter] = useState<CommTimelineFilter>("all");
  const [callDetail, setCallDetail] = useState<CommunicationTimelineRow | null>(null);

  const visible = useMemo(() => filterRows(rows, filter), [rows, filter]);

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Communication timeline</h2>
        <div className="flex flex-wrap gap-1">
          {(
            [
              ["all", "All"],
              ["sms", "SMS"],
              ["calls", "Calls"],
              ["notes", "Notes"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={`${TAB_CLS} ${filter === key ? TAB_ACTIVE : TAB_IDLE}`}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">{emptyHint ?? "No timeline entries yet."}</p>
      ) : visible.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">Nothing in this filter.</p>
      ) : (
        <ul className="mt-3 space-y-3">
          {visible.map((e, i) => (
            <li key={`${e.kind}-${e.kind === "sms" ? e.id : e.kind === "call" ? e.id : e.id}-${i}`} className="flex gap-3 text-sm">
              <span className="w-24 shrink-0 text-[11px] text-slate-400">{formatAdminPhoneWhen(e.createdAt)}</span>
              <div className="min-w-0 flex-1">
                {e.kind === "sms" ? (
                  <>
                    <p className="font-medium text-slate-800">
                      SMS · {e.direction}
                      <Link
                        href={buildWorkspaceInboxLeadSmsHref({
                          conversationId: e.conversationId,
                          leadId: leadId ?? undefined,
                        })}
                        className="ml-2 text-xs font-semibold text-sky-800 underline-offset-2 hover:underline"
                      >
                        Open thread
                      </Link>
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{e.body}</p>
                  </>
                ) : e.kind === "call" ? (
                  <>
                    <button
                      type="button"
                      className="text-left font-medium text-slate-800 hover:text-sky-900"
                      onClick={() => setCallDetail(e)}
                    >
                      Call · {e.direction}
                      {e.hasVm ? (
                        <span className="ml-2 rounded-full bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900">
                          Voicemail
                        </span>
                      ) : null}
                      <span className="ml-2 text-[11px] font-normal text-sky-700">View details</span>
                    </button>
                    <p className="mt-0.5 text-xs text-slate-500">{e.summaryLine}</p>
                  </>
                ) : e.kind === "note" ? (
                  <>
                    <p className="font-medium text-slate-800">{e.title}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{e.body}</p>
                  </>
                ) : e.kind === "stage_history" ? (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-violet-700/90">
                      Stage history
                    </p>
                    <p className="mt-0.5 text-sm text-slate-700">{e.body}</p>
                  </>
                ) : (
                  <>
                    <p className="font-medium text-slate-800">{e.label}</p>
                    <p className="mt-0.5 whitespace-pre-wrap text-slate-600">{e.body}</p>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {callDetail?.kind === "call" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="call-detail-title"
          onClick={() => setCallDetail(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h3 id="call-detail-title" className="text-sm font-semibold text-slate-900">
              Call details
            </h3>
            <dl className="mt-3 space-y-2 text-sm text-slate-700">
              <div>
                <dt className="text-[10px] font-semibold uppercase text-slate-400">When</dt>
                <dd>{formatAdminPhoneWhen(callDetail.createdAt)}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-slate-400">Direction</dt>
                <dd>{callDetail.direction}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-slate-400">Status</dt>
                <dd>{callDetail.status}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-slate-400">Duration</dt>
                <dd>{callDetail.durationSeconds != null ? `${callDetail.durationSeconds}s` : "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-slate-400">From</dt>
                <dd className="font-mono text-xs">{callDetail.fromE164 ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-semibold uppercase text-slate-400">To</dt>
                <dd className="font-mono text-xs">{callDetail.toE164 ?? "—"}</dd>
              </div>
              {callDetail.hasVm ? (
                <div>
                  <dt className="text-[10px] font-semibold uppercase text-slate-400">Voicemail</dt>
                  <dd>Yes</dd>
                </div>
              ) : null}
            </dl>
            <button
              type="button"
              className="mt-5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              onClick={() => setCallDetail(null)}
            >
              Close
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
