"use server";

import { quickAddInsurancePayer, type InsurancePayerListItem } from "@/lib/crm/insurance-payers";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export async function quickAddInsurancePayerAction(
  payerName: string,
  structuredPayerType?: string | null
): Promise<
  | { ok: true; payer: InsurancePayerListItem }
  | { ok: false; error: "forbidden" | "blank" | "lookup_failed" | "insert_failed" | "unknown" }
> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "forbidden" };
  }

  const res = await quickAddInsurancePayer(payerName, {
    payerType: structuredPayerType,
    createdBy: staff.user_id,
  });

  if (!res.ok) {
    if (res.error === "blank") return { ok: false, error: "blank" };
    if (res.error === "lookup_failed") return { ok: false, error: "lookup_failed" };
    return { ok: false, error: "insert_failed" };
  }

  return { ok: true, payer: res.payer };
}
