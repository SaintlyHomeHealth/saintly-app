import {
  parseRnPerVisitRates,
  type RnPerVisitRates,
} from "@/lib/employee-contracts";

export type RnVisitLineType = "visit" | "soc";

export type RnRateAgreement = {
  payRate: number;
  perVisitRates?: unknown;
};

export type ResolveRnVisitRateInput = {
  lineType: RnVisitLineType;
  /** Patient payer / insurance label from CRM when known. */
  payerHint?: string | null;
  agreement: RnRateAgreement | null;
};

export type ResolveRnVisitRateResult = {
  amount: number;
  source: "soc" | "tango" | "visit" | "pay_rate" | "missing";
  appliedTangoOverride: boolean;
};

export function isTangoPayer(payerHint?: string | null): boolean {
  if (!payerHint) return false;
  return /\btango\b/i.test(payerHint.trim());
}

function positiveRate(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

export function extractRnRates(agreement: RnRateAgreement | null): {
  visit: number | null;
  soc: number | null;
  tango: number | null;
  payRate: number | null;
  parsed: RnPerVisitRates | null;
} {
  if (!agreement) {
    return { visit: null, soc: null, tango: null, payRate: null, parsed: null };
  }

  const parsed = parseRnPerVisitRates(agreement.perVisitRates);
  const payRate = positiveRate(agreement.payRate);
  return {
    visit: parsed?.visit ?? null,
    soc: parsed?.soc ?? null,
    tango: parsed?.tango ?? null,
    payRate,
    parsed,
  };
}

/**
 * Rate resolution:
 * 1. SOC → agreement soc (fallback pay_rate / visit)
 * 2. Else if agreement has tango rate AND patient payer is Tango → tango
 * 3. Else → agreement visit (fallback pay_rate)
 */
export function resolveRnVisitRate(input: ResolveRnVisitRateInput): ResolveRnVisitRateResult {
  const rates = extractRnRates(input.agreement);

  if (input.lineType === "soc") {
    const amount = rates.soc ?? rates.visit ?? rates.payRate;
    if (amount == null) {
      return { amount: 0, source: "missing", appliedTangoOverride: false };
    }
    return {
      amount,
      source: rates.soc != null ? "soc" : rates.visit != null ? "visit" : "pay_rate",
      appliedTangoOverride: false,
    };
  }

  if (rates.tango != null && isTangoPayer(input.payerHint)) {
    return { amount: rates.tango, source: "tango", appliedTangoOverride: true };
  }

  const amount = rates.visit ?? rates.payRate;
  if (amount == null) {
    return { amount: 0, source: "missing", appliedTangoOverride: false };
  }

  return {
    amount,
    source: rates.visit != null ? "visit" : "pay_rate",
    appliedTangoOverride: false,
  };
}
