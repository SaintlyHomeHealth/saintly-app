import Link from "next/link";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { AdminPageShell } from "@/components/admin/design-system";
import { OnCallBoard } from "@/components/compliance/on-call-board";
import { PeriodPicker } from "@/components/compliance/period-picker";
import { OnCallPrint } from "@/components/compliance/print-docs";
import { PrintButton } from "@/components/compliance/record-actions";
import { complianceContext } from "@/lib/compliance/page-context";
import { complianceHref, monthLabel, monthsInQuarter, periodLabel, quarterRangeIso, monthRangeIso } from "@/lib/compliance/period";
import { getAttestation, listOnCall, readCompliance } from "@/lib/compliance/queries";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";

export const dynamic = "force-dynamic";

export default async function OnCallPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; quarter?: string; month?: string }>;
}) {
  const sp = await searchParams;
  const ctx = await complianceContext(sp);
  const monthNum = Number.parseInt(sp.month ?? "", 10);
  const months = monthsInQuarter(ctx.quarter);
  const month = months.includes(monthNum) ? monthNum : null;
  const range = month ? monthRangeIso(ctx.year, month) : quarterRangeIso(ctx.year, ctx.quarter);
  const period = month ? monthLabel(ctx.year, month) : periodLabel(ctx.year, ctx.quarter);

  const loaded = await readCompliance(() =>
    Promise.all([
      listOnCall(range.start, range.end),
      getAttestation("quarter", ctx.year, ctx.quarter),
      month ? getAttestation("month", ctx.year, month) : Promise.resolve(null),
    ])
  );
  if (!loaded.ok) {
    return (
      <AdminPageShell>
        <AdminPageHeader eyebrow="Saintly Home Health" title="On-Call Log" description={loaded.message} />
      </AdminPageShell>
    );
  }
  const [rows, attestation, monthAttestation] = loaded.data;
  const printedAt = formatAppDateTime(new Date());

  return (
    <>
      <div className="compliance-screen-only">
        <AdminPageShell>
          <AdminPageHeader
            eyebrow="Saintly Home Health"
            title="On-Call Log"
            description={period}
            actions={
              <div className="flex flex-wrap items-end gap-3">
                <PeriodPicker year={ctx.year} quarter={ctx.quarter} years={ctx.years} path="/admin/compliance/on-call" />
                <div className="flex flex-wrap gap-2">
                  {months.map((item) => (
                    <Link
                      key={item}
                      href={complianceHref("/admin/compliance/on-call", ctx.year, ctx.quarter, { month: item })}
                      className={`rounded-full px-3 py-2 text-sm font-semibold ${
                        month === item ? "bg-sky-600 text-white" : "bg-white text-slate-700 ring-1 ring-slate-200"
                      }`}
                    >
                      {monthLabel(ctx.year, item).split(" ")[0]}
                    </Link>
                  ))}
                  <Link
                    href={complianceHref("/admin/compliance/on-call", ctx.year, ctx.quarter)}
                    className={`rounded-full px-3 py-2 text-sm font-semibold ${
                      month ? "bg-white text-slate-700 ring-1 ring-slate-200" : "bg-sky-600 text-white"
                    }`}
                  >
                    Whole quarter
                  </Link>
                </div>
              </div>
            }
          />
          <div className="flex flex-wrap gap-3">
            <PrintButton label={month ? "Print Month" : "Print Quarter"} />
            {month ? (
              <Link href={complianceHref("/admin/compliance/on-call", ctx.year, ctx.quarter)} className="inline-flex items-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-800">
                Show whole quarter
              </Link>
            ) : null}
          </div>
          <OnCallBoard
            rows={rows}
            today={ctx.today}
            time={ctx.time}
            signerName={ctx.signerName}
            year={ctx.year}
            quarter={ctx.quarter}
            month={month ?? months[0]}
            attestation={month ? null : attestation}
            monthAttestation={month ? monthAttestation : null}
            allowMonthNil={Boolean(month)}
          />
          <p className="text-sm text-slate-500">
            If there were no calls, sign the no-calls page once for the quarter. You do not need to open this log every day.
          </p>
          <Link href={complianceHref("/admin/compliance", ctx.year, ctx.quarter)} className="text-sm font-semibold text-sky-700">
            Back to Compliance Logs
          </Link>
        </AdminPageShell>
      </div>
      <div className="compliance-print-only mx-auto max-w-3xl bg-white p-6">
        <OnCallPrint
          rows={rows}
          period={period}
          printedAt={printedAt}
          attestation={month ? monthAttestation : attestation}
        />
      </div>
    </>
  );
}
