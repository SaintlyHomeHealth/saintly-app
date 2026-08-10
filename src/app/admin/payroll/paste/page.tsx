import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import {
  buildAdminPayrollWeekPickerOptions,
  ensureAdminPayrollWeekInPickerOptions,
  getPayPeriodForDate,
} from "@/lib/payroll/pay-period";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

import { PasteVisitImportClient } from "./PasteVisitImportClient";

export default async function AdminPayrollPastePage({
  searchParams,
}: {
  searchParams?: Promise<{ week?: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const now = new Date();
  const defaultPeriod = getPayPeriodForDate(now);
  const sp = await searchParams;
  const weekRaw = typeof sp?.week === "string" ? sp.week.trim() : "";
  let selectedPeriod = defaultPeriod;
  if (/^\d{4}-\d{2}-\d{2}$/.test(weekRaw)) {
    const parsed = new Date(`${weekRaw}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) {
      selectedPeriod = getPayPeriodForDate(parsed);
    }
  }

  const { data: nurseBillingPeriodRows } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .select("pay_period_start, pay_period_end")
    .order("pay_period_start", { ascending: false })
    .limit(400);

  const periodOptions = ensureAdminPayrollWeekInPickerOptions(
    buildAdminPayrollWeekPickerOptions(now, nurseBillingPeriodRows ?? []),
    selectedPeriod
  );

  return (
    <div className="mx-auto max-w-[1600px] px-4 py-8 sm:px-6">
      <AdminPageHeader
        accent="indigo"
        eyebrow="Payroll"
        title="Paste visits"
        description="Copy completed visits from the EMR, match them to RN agreements, edit pay if needed, and save without double-paying."
        actions={
          <Link
            href={`/admin/payroll?week=${encodeURIComponent(selectedPeriod.payPeriodStart)}`}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Weekly payroll
          </Link>
        }
      />

      <div className="mt-8">
        <PasteVisitImportClient
          selectedWeekStart={selectedPeriod.payPeriodStart}
          periodOptions={periodOptions.map((o) => ({ start: o.start, label: o.label }))}
        />
      </div>
    </div>
  );
}
