"use client";

import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export type RecruitingLeadActivityRow = {
  id: string;
  event_type: string;
  body: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  created_by_name?: string | null;
};

function formatWhen(iso: string): string {
  return formatAppDateTime(iso, "—", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function eventLabel(eventType: string): string {
  switch (eventType) {
    case "outbound_email":
      return "Email sent";
    case "outbound_email_failed":
      return "Email failed";
    case "admin_sms_alert":
      return "Admin SMS alert";
    default:
      return eventType.replace(/_/g, " ");
  }
}

export function RecruitingLeadActivityTimeline({ activities }: { activities: RecruitingLeadActivityRow[] }) {
  if (activities.length === 0) {
    return (
      <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/80 px-6 py-10 text-center text-sm text-slate-600 shadow-sm">
        No activity yet. Sent emails and follow-ups will appear here.
      </div>
    );
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <h3 className="text-sm font-semibold text-slate-900">Activity</h3>
      <ul className="mt-4 space-y-4">
        {activities.map((row) => {
          const meta = row.metadata ?? {};
          const subject = typeof meta.subject === "string" ? meta.subject : null;
          const recipient = typeof meta.recipient === "string" ? meta.recipient : null;
          const deliveryStatus = typeof meta.delivery_status === "string" ? meta.delivery_status : null;
          const alertStatus = typeof meta.status === "string" ? meta.status : null;
          const bodyText = typeof meta.body === "string" ? meta.body : null;
          const error = typeof meta.error === "string" ? meta.error : null;

          return (
            <li key={row.id} className="rounded-xl border border-slate-200/90 bg-slate-50/50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{eventLabel(row.event_type)}</p>
                <p className="text-xs text-slate-500">{formatWhen(row.created_at)}</p>
              </div>
              {row.created_by_name ? (
                <p className="mt-1 text-xs text-slate-500">By {row.created_by_name}</p>
              ) : null}
              {recipient ? <p className="mt-2 text-xs text-slate-700">To: {recipient}</p> : null}
              {subject ? <p className="mt-1 text-xs text-slate-700">Subject: {subject}</p> : null}
              {deliveryStatus ? (
                <p className="mt-1 text-xs text-slate-600">Status: {deliveryStatus}</p>
              ) : alertStatus ? (
                <p className="mt-1 text-xs text-slate-600">Status: {alertStatus}</p>
              ) : null}
              {bodyText ? (
                <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-700">
                  {bodyText}
                </pre>
              ) : row.body ? (
                <p className="mt-2 whitespace-pre-wrap text-xs text-slate-700">{row.body}</p>
              ) : null}
              {error ? <p className="mt-2 text-xs text-red-700">{error}</p> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
