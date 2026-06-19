import Link from "next/link";

import { createPatientReferralSignedUrl } from "@/lib/crm/patient-referral/storage";
import { patientReferralSourceLabel } from "@/lib/crm/patient-referral/options";
import type { PatientFileListRow, PatientReferralListRow } from "@/lib/crm/patient-referral/types";
import { formatAppDate } from "@/lib/datetime/app-timezone";

function visitSummary(r: PatientReferralListRow): string {
  const parts: string[] = [];
  if (r.sn_visits != null) parts.push(`SN ${r.sn_visits}`);
  if (r.pt_visits != null) parts.push(`PT ${r.pt_visits}`);
  if (r.ot_visits != null) parts.push(`OT ${r.ot_visits}`);
  if (r.st_visits != null) parts.push(`ST ${r.st_visits}`);
  if (r.msw_visits != null) parts.push(`MSW ${r.msw_visits}`);
  if (r.hha_visits != null) parts.push(`HHA ${r.hha_visits}`);
  return parts.length ? parts.join(" · ") : "—";
}

export async function PatientReferralsSection({
  referrals,
  files,
}: {
  patientId: string;
  referrals: PatientReferralListRow[];
  files: PatientFileListRow[];
}) {
  if (!referrals.length && !files.length) return null;

  const fileLinks = await Promise.all(
    files.map(async (f) => ({
      ...f,
      url: await createPatientReferralSignedUrl(f.file_path, 3600),
    }))
  );

  return (
    <section className="rounded-[20px] border border-slate-200/90 bg-white px-4 py-4 shadow-sm sm:px-5">
      <h2 className="text-base font-semibold text-slate-900">Referrals / Intake Documents</h2>
      <p className="mt-1 text-sm text-slate-600">Quick-drop referral intake history and uploaded documents for this patient.</p>

      {referrals.length > 0 ? (
        <ul className="mt-4 space-y-3">
          {referrals.map((r) => (
            <li key={r.id} className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold text-slate-900">{patientReferralSourceLabel(r.referral_source_type)}</span>
                <span className="text-xs text-slate-500">{formatAppDate(r.created_at, "—")}</span>
              </div>
              <dl className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
                <div>
                  <dt className="font-medium text-slate-500">Received</dt>
                  <dd>{formatAppDate(r.received_date, "—")}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">SOC date</dt>
                  <dd>{formatAppDate(r.requested_soc_date, "—")}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Payer</dt>
                  <dd>{r.insurance_name ?? "—"}</dd>
                </div>
                <div>
                  <dt className="font-medium text-slate-500">Authorization #</dt>
                  <dd>{r.authorization_number ?? "—"}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="font-medium text-slate-500">Approved visits</dt>
                  <dd>{visitSummary(r)}</dd>
                </div>
                {r.chief_complaint ? (
                  <div className="sm:col-span-2">
                    <dt className="font-medium text-slate-500">Chief complaint</dt>
                    <dd>{r.chief_complaint}</dd>
                  </div>
                ) : null}
                {r.referral_facility ? (
                  <div className="sm:col-span-2">
                    <dt className="font-medium text-slate-500">Facility</dt>
                    <dd>{r.referral_facility}</dd>
                  </div>
                ) : null}
              </dl>
              {r.intake_status ? (
                <p className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-sky-800">{r.intake_status}</p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {fileLinks.length > 0 ? (
        <div className="mt-4">
          <h3 className="text-sm font-semibold text-slate-800">Uploaded documents</h3>
          <ul className="mt-2 space-y-2">
            {fileLinks.map((f) => (
              <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-slate-800">{f.file_name}</span>
                {f.url ? (
                  <Link href={f.url} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-sky-800 hover:underline">
                    View file
                  </Link>
                ) : (
                  <span className="text-xs text-slate-400">Unavailable</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
