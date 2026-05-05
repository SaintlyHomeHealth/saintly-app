"use server";

import { quickAddInsurancePayer } from "@/lib/crm/insurance-payers";
import type { InsurancePayer } from "@/lib/crm/insurance-payer-types";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export async function quickAddInsurancePayerAction(
  payerName: string,
  payerType?: string | null
): Promise<
  | { ok: true; payer: InsurancePayer }
  | { ok: false; error: "forbidden" | "blank" | "lookup_failed" | "insert_failed" | "unknown" }
> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const res = await quickAddInsurancePayer(payerName, {
    payerType: payerType ?? null,
    createdBy: staff.user_id,
  });

  if (!res.ok) {
    if (res.error === "blank") return { ok: false, error: "blank" };
    if (res.error === "lookup_failed") return { ok: false, error: "lookup_failed" };
    return { ok: false, error: "insert_failed" };
  }

  return { ok: true, payer: res.payer };
}
