import { supabaseAdmin } from "@/lib/admin";

/**
 * Single authoritative recompute of employee_earnings for a calendar year from payroll_visit_items + visits.service_date.
 * ytd = sum gross for non-void items with service in year; paid = subset with status paid; pending = ytd - paid.
 */
export async function recomputeEmployeeEarningsForYear(employeeId: string, year: number): Promise<void> {
  const { data: items, error: qErr } = await supabaseAdmin
    .from("payroll_visit_items")
    .select("gross_amount, status, visit_id")
    .eq("employee_id", employeeId);

  if (qErr) throw qErr;

  const visitIds = [...new Set((items ?? []).map((r) => r.visit_id))];
  const { data: visits, error: vErr } =
    visitIds.length > 0
      ? await supabaseAdmin.from("visits").select("id, service_date").in("id", visitIds)
      : { data: [] as { id: string; service_date: string | null }[], error: null };

  if (vErr) throw vErr;
  const serviceByVisit = new Map((visits ?? []).map((v) => [v.id, v.service_date]));

  let ytd = 0;
  let paid = 0;

  for (const row of items ?? []) {
    const sd = serviceByVisit.get(row.visit_id);
    if (!sd) continue;
    const y = Number(sd.slice(0, 4));
    if (y !== year) continue;

    const gross = Number(row.gross_amount ?? 0);
    const st = row.status;
    if (st === "void") continue;

    ytd += gross;
    if (st === "paid") paid += gross;
  }

  const pending = Math.max(0, Math.round((ytd - paid) * 100) / 100);
  ytd = Math.round(ytd * 100) / 100;
  paid = Math.round(paid * 100) / 100;

  const { error: upErr } = await supabaseAdmin.from("employee_earnings").upsert(
    {
      employee_id: employeeId,
      earnings_year: year,
      ytd_earnings: ytd,
      total_paid: paid,
      total_pending: pending,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "employee_id,earnings_year" }
  );

  if (upErr) throw upErr;
}

export function earningsYearFromServiceDate(serviceDateIso: string): number {
  return Number(serviceDateIso.slice(0, 4));
}
