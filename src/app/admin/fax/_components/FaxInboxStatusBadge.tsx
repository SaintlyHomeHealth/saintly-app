import { FAX_INBOX_STATUS_LABELS, type FaxInboxStatus } from "@/lib/fax/fax-ehr-filing";

const BADGE_CLASS: Record<FaxInboxStatus, string> = {
  unfiled: "border-amber-200 bg-amber-50 text-amber-800",
  filed: "border-emerald-200 bg-emerald-50 text-emerald-700",
  needs_admission: "border-sky-200 bg-sky-50 text-sky-800",
  wrong_recipient: "border-violet-200 bg-violet-50 text-violet-800",
  junk: "border-slate-200 bg-slate-100 text-slate-600",
  unreadable: "border-rose-200 bg-rose-50 text-rose-800",
};

export function FaxInboxStatusBadge({ status }: { status: FaxInboxStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-bold ${BADGE_CLASS[status]}`}
    >
      {FAX_INBOX_STATUS_LABELS[status]}
    </span>
  );
}
