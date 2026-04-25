import Link from "next/link";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import {
  rollUpOutboundSmsByFrom,
  type OutboundSmsAuditRow,
} from "@/lib/phone/sms-sender-audit";
import { SAINTLY_BACKUP_SMS_E164, SAINTLY_PRIMARY_SMS_E164 } from "@/lib/twilio/sms-from-numbers";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { isValidE164 } from "@/lib/softphone/phone-number";
import { getStaffProfile, isAdminOrHigher, isPhoneWorkspaceUser } from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

const WINDOW_DAYS = 7;
const FETCH_CAP = 15_000;

function displayFromLabel(fromKey: string): string {
  if (fromKey.startsWith("(") || fromKey.includes("awaiting") || fromKey.includes("no metadata")) {
    return fromKey;
  }
  if (isValidE164(fromKey)) return formatPhoneForDisplay(fromKey);
  return fromKey;
}

export default async function AdminSmsSenderAuditPage() {
  const staff = await getStaffProfile();
  if (!staff || !isPhoneWorkspaceUser(staff) || !staff.phone_access_enabled || !isAdminOrHigher(staff)) {
    redirect("/admin/phone");
  }

  // Rolling 7d filter for the audit query; intentionally uses wall-clock "now" once per request.
  const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString(); // eslint-disable-line react-hooks/purity -- one-shot server request

  const { data: rawRows, error } = await supabaseAdmin
    .from("messages")
    .select("metadata")
    .eq("direction", "outbound")
    .is("deleted_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(FETCH_CAP);

  if (error) {
    console.warn("[sms-sender-audit] load:", error.message);
  }

  const rows: OutboundSmsAuditRow[] = (rawRows ?? []).map((r) => ({ metadata: r.metadata }));
  const { total, backupCount, byFrom } = rollUpOutboundSmsByFrom(rows);
  const truncated = (rawRows?.length ?? 0) >= FETCH_CAP;

  return (
    <div className="space-y-4 p-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone CRM · internal</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">SMS sender audit</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">
          Outbound rows from <code className="text-xs">public.messages</code> in the last {WINDOW_DAYS} days, grouped
          by <code className="text-xs">metadata.twilio_delivery.from</code> (set on send for E.164 mode and updated
          from Twilio status callbacks with the final <code className="text-xs">From</code>). Messaging Service
          sends may show “awaiting…” until the callback arrives.
        </p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm">
          <Link href="/admin/phone/messages" className="font-semibold text-sky-800 underline">
            ← SMS inbox
          </Link>
          <Link href="/admin/phone/sms-telemetry" className="font-semibold text-sky-800 underline">
            SMS suggestion telemetry
          </Link>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Source doc (repo): <code className="rounded bg-slate-100 px-1">docs/twilio-sms-sender-verification.md</code> —
          Messaging Service pool notes and production smoke steps.
        </p>
      </div>

      {backupCount > 0 ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50/90 px-3 py-2 text-sm text-amber-950"
          role="status"
        >
          <span className="font-semibold">Backup long code in window:</span> {backupCount} message
          {backupCount === 1 ? "" : "s"} with <code className="text-xs">{SAINTLY_BACKUP_SMS_E164}</code> in{" "}
          <code className="text-xs">twilio_delivery.from</code> (expected only when the backup line was used — e.g.
          explicit Text-from pick or intentional env override). Primary reference:{" "}
          <code className="text-xs">{SAINTLY_PRIMARY_SMS_E164}</code>.
        </div>
      ) : null}

      <p className="text-sm text-slate-600">
        <span className="font-semibold text-slate-800">Total outbound in sample:</span> {total}
        {truncated ? (
          <span className="ml-2 text-amber-800">(capped at {FETCH_CAP} newest rows — increase window precision in DB if
            needed)</span>
        ) : null}
      </p>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-left text-xs">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50 font-semibold text-slate-600">
              <th className="px-3 py-2">From (Twilio / stored)</th>
              <th className="px-3 py-2">Count</th>
              <th className="px-3 py-2">By path (metadata.source or compose)</th>
            </tr>
          </thead>
          <tbody>
            {byFrom.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-4 text-slate-500">
                  No outbound messages in the last {WINDOW_DAYS} days.
                </td>
              </tr>
            ) : (
              byFrom.map((r) => (
                <tr
                  key={r.fromDisplay}
                  className={`border-b border-slate-100 last:border-0 ${
                    r.isBackup ? "bg-amber-50/50" : ""
                  }`}
                >
                  <td className="px-3 py-2 align-top font-mono text-[11px] text-slate-900">
                    {displayFromLabel(r.fromDisplay)}
                    {r.isBackup ? (
                      <span className="ml-2 rounded bg-amber-200/80 px-1.5 py-0.5 text-[10px] font-sans font-semibold text-amber-950">
                        backup
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 align-top tabular-nums text-slate-800">{r.count}</td>
                  <td className="px-3 py-2 align-top text-slate-700">
                    <ul className="list-inside list-disc space-y-0.5">
                      {r.byPath.map((b) => (
                        <li key={b.path}>
                          <code className="text-[11px]">{b.path}</code> — {b.count}
                        </li>
                      ))}
                    </ul>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
