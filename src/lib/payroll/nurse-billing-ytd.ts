import "server-only";

import { supabaseAdmin } from "@/lib/admin";

/**
 * Sum of all line amounts on paid weekly self-billings for the calendar year of `paid_at`,
 * grouped by employee (applicant id).
 */
export async function fetchYtdPaidTotalsByEmployee(calendarYear: number): Promise<Map<string, number>> {
  const start = `${calendarYear}-01-01T00:00:00.000Z`;
  const end = `${calendarYear + 1}-01-01T00:00:00.000Z`;

  const { data, error } = await supabaseAdmin
    .from("nurse_weekly_billings")
    .select(
      `
      employee_id,
      nurse_weekly_billing_lines ( amount )
    `
    )
    .eq("status", "paid")
    .gte("paid_at", start)
    .lt("paid_at", end);

  if (error) {
    console.warn("[nurse-billing-ytd]", error.message);
    return new Map();
  }

  const out = new Map<string, number>();
  for (const row of data ?? []) {
    const empId = typeof row.employee_id === "string" ? row.employee_id : "";
    if (!empId) continue;
    const raw = row.nurse_weekly_billing_lines;
    const lines = Array.isArray(raw) ? raw : raw ? [raw] : [];
    let sum = 0;
    for (const L of lines) {
      sum += Number((L as { amount?: unknown }).amount ?? 0);
    }
    out.set(empId, (out.get(empId) ?? 0) + sum);
  }
  return out;
}

/** YTD paid total for one employee (same rules as {@link fetchYtdPaidTotalsByEmployee}). */
export async function fetchYtdPaidForEmployee(employeeId: string, calendarYear: number): Promise<number> {
  const m = await fetchYtdPaidTotalsByEmployee(calendarYear);
  return m.get(employeeId) ?? 0;
}
