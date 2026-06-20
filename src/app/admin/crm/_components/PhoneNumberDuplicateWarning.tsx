import Link from "next/link";

import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import type { PhoneDuplicateRecord } from "@/lib/crm/phone-number-duplicate-records";

function recordTypeLabel(recordType: PhoneDuplicateRecord["recordType"]): string {
  switch (recordType) {
    case "lead":
      return "Lead";
    case "patient":
      return "Patient";
    case "contact":
      return "Contact";
    default:
      return "Record";
  }
}

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return formatAppDateTime(iso, "—", { dateStyle: "medium", timeStyle: "short" });
}

export function PhoneNumberDuplicateWarning({
  records,
  className = "",
}: {
  records: PhoneDuplicateRecord[];
  className?: string;
}) {
  if (records.length === 0) return null;

  return (
    <div
      className={`rounded-2xl border border-amber-300 bg-amber-50/95 p-4 shadow-sm ring-1 ring-amber-100 ${className}`}
      role="alert"
    >
      <h3 className="text-sm font-bold text-amber-950">Shared phone number</h3>
      <p className="mt-1 text-xs leading-relaxed text-amber-900/90">
        This phone number is also linked to another lead/contact. Review before texting or calling.
        Older SMS and voicemail history may belong to a prior record with this number.
      </p>

      <div className="mt-3 overflow-x-auto rounded-xl border border-amber-200/80 bg-white/70">
        <table className="min-w-full text-left text-xs">
          <thead>
            <tr className="border-b border-amber-100 text-[10px] font-semibold uppercase tracking-wide text-amber-900/80">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Source</th>
              <th className="px-3 py-2">Created</th>
              <th className="px-3 py-2">Last activity</th>
              <th className="px-3 py-2 text-right">Open</th>
            </tr>
          </thead>
          <tbody>
            {records.map((record) => (
              <tr key={`${record.recordType}:${record.recordId}`} className="border-b border-amber-50 last:border-0">
                <td className="px-3 py-2.5 font-semibold text-slate-900">{record.name}</td>
                <td className="px-3 py-2.5 text-slate-700">{recordTypeLabel(record.recordType)}</td>
                <td className="px-3 py-2.5 text-slate-700">{record.source ?? "—"}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-600">{formatWhen(record.createdAt)}</td>
                <td className="px-3 py-2.5 tabular-nums text-slate-600">{formatWhen(record.lastActivityAt)}</td>
                <td className="px-3 py-2.5 text-right">
                  <Link
                    href={record.href}
                    className="font-semibold text-amber-950 underline-offset-2 hover:underline"
                  >
                    Open →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
