export type ContractPayFields = {
  pay_type: "per_visit" | "hourly" | "salary";
  pay_rate: number;
  contract_status: string;
};

/**
 * Hours between check-in and check-out (fractional), or null if invalid.
 */
export function visitWorkedHours(checkInIso: string, checkOutIso: string): number | null {
  const a = Date.parse(checkInIso);
  const b = Date.parse(checkOutIso);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return null;
  return (b - a) / 3_600_000;
}

/**
 * Contract-based gross pay for a single visit. Requires signed contract for non-zero pay.
 */
export function computeVisitGrossPay(
  contract: ContractPayFields | null,
  checkInIso: string | null,
  checkOutIso: string | null
): number {
  if (!contract || contract.contract_status !== "signed") return 0;
  const rate = Number(contract.pay_rate);
  if (!Number.isFinite(rate) || rate < 0) return 0;

  if (contract.pay_type === "per_visit") {
    return Math.round(rate * 100) / 100;
  }

  if (!checkInIso || !checkOutIso) return 0;
  const hours = visitWorkedHours(checkInIso, checkOutIso);
  if (hours == null || hours <= 0) return 0;

  if (contract.pay_type === "hourly") {
    return Math.round(hours * rate * 100) / 100;
  }

  // salary: treat pay_rate as annual dollars, standard 2080 hours/year
  const hourly = rate / 2080;
  return Math.round(hours * hourly * 100) / 100;
}
