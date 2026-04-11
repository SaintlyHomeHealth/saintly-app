import { supabaseAdmin } from "@/lib/admin";

export type ContractRowForPay = {
  id: string;
  pay_type: "per_visit" | "hourly" | "salary";
  pay_rate: number;
  contract_status: string;
  employment_classification: "employee" | "contractor";
  effective_date: string;
};

/**
 * Signed contract effective on date of service (latest effective_date <= serviceDate).
 */
export async function loadContractForServiceDate(
  applicantId: string,
  serviceDateIso: string
): Promise<ContractRowForPay | null> {
  const { data, error } = await supabaseAdmin
    .from("employee_contracts")
    .select("id, pay_type, pay_rate, contract_status, employment_classification, effective_date")
    .eq("applicant_id", applicantId)
    .eq("contract_status", "signed")
    .lte("effective_date", serviceDateIso)
    .order("effective_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const pt = data.pay_type;
  if (pt !== "per_visit" && pt !== "hourly" && pt !== "salary") return null;
  const ec = data.employment_classification;
  if (ec !== "employee" && ec !== "contractor") return null;
  const rate = Number(data.pay_rate);
  if (!Number.isFinite(rate) || rate < 0) return null;
  return {
    id: data.id,
    pay_type: pt,
    pay_rate: rate,
    contract_status: typeof data.contract_status === "string" ? data.contract_status : "",
    employment_classification: ec,
    effective_date: typeof data.effective_date === "string" ? data.effective_date : serviceDateIso,
  };
}
