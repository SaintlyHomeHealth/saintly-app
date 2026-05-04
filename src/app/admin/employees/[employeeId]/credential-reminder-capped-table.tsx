"use client";

import { useState, useMemo, memo } from "react";

import {
  formatCredentialReminderCredentialType,
  formatCredentialReminderStage,
} from "@/lib/admin/credential-reminder-display";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

import { DocumentColumnsSkeleton } from "./onboarding-deferred-skeletons";

function credentialReminderLogPhoneDisplay(metadata: unknown): string {
  if (!metadata || typeof metadata !== "object") return "—";
  const phone = (metadata as Record<string, unknown>).phone_e164;
  if (typeof phone === "string" && phone.trim()) {
    return formatPhoneForDisplay(phone);
  }
  return "—";
}

type LogRow = {
  id: string;
  credential_type: string;
  reminder_stage: string;
  created_at: string;
  expiration_anchor: string;
  metadata: unknown;
};

type Props = {
  rows: LogRow[];
};

const VISIBLE = 20;

function formatDateTimeClient(dateString: string) {
  return formatAppDateTime(dateString, dateString, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const ReminderRow = memo(function ReminderRow({ row }: { row: LogRow }) {
  return (
    <tr className="border-b border-slate-100 last:border-0">
      <td className="px-3 py-2 font-medium text-slate-900">
        {formatCredentialReminderCredentialType(row.credential_type)}
      </td>
      <td className="px-3 py-2 text-slate-700">{formatCredentialReminderStage(row.reminder_stage)}</td>
      <td className="px-3 py-2 font-mono text-xs text-slate-600">{row.expiration_anchor}</td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
        {formatDateTimeClient(row.created_at)}
      </td>
      <td className="whitespace-nowrap px-3 py-2 text-slate-700">
        {credentialReminderLogPhoneDisplay(row.metadata)}
      </td>
    </tr>
  );
});

/**
 * Long SMS reminder logs: render first chunk only, expand on demand to avoid a huge static table.
 */
function CredentialReminderCappedTableInner({ rows }: Props) {
  const [showAll, setShowAll] = useState(false);
  const visible = useMemo(
    () => (showAll ? rows : rows.slice(0, VISIBLE)),
    [rows, showAll]
  );
  const hidden = Math.max(0, rows.length - VISIBLE);

  if (rows.length === 0) {
    return <p className="mt-3 text-sm text-slate-500">No credential reminders have been logged for this employee yet.</p>;
  }

  return (
    <div>
      <div className="mt-4 overflow-x-auto rounded-[16px] border border-slate-200 bg-white">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
              <th className="px-3 py-2">Credential</th>
              <th className="px-3 py-2">Reminder stage</th>
              <th className="px-3 py-2">Expiration anchor</th>
              <th className="px-3 py-2">Sent at</th>
              <th className="px-3 py-2">Phone</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <ReminderRow key={row.id} row={row} />
            ))}
          </tbody>
        </table>
      </div>
      {hidden > 0 && !showAll ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-2 text-sm font-semibold text-violet-800 underline"
        >
          Show {hidden} more…
        </button>
      ) : null}
    </div>
  );
}

export default memo(CredentialReminderCappedTableInner);

export function CredentialReminderCappedTableLoading() {
  return <DocumentColumnsSkeleton />;
}
