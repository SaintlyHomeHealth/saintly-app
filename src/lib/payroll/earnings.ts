/**
 * Earnings aggregates are maintained only via `recomputeEmployeeEarningsForYear`
 * (see recompute-earnings.ts) so totals cannot drift from payroll_visit_items.
 */
export { recomputeEmployeeEarningsForYear } from "@/lib/payroll/recompute-earnings";
