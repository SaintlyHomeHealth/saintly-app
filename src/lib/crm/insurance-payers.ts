import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import type { InsurancePayer } from "@/lib/crm/insurance-payer-types";

function mapRow(r: Record<string, unknown>): InsurancePayer {
  return {
    id: String(r.id ?? ""),
    payer_name: String(r.payer_name ?? "").trim(),
    normalized_name: String(r.normalized_name ?? "").trim(),
    payer_type: typeof r.payer_type === "string" && r.payer_type.trim() ? r.payer_type.trim() : null,
    sort_order: typeof r.sort_order === "number" ? r.sort_order : null,
    is_active: r.is_active === true,
  };
}

/**
 * Active payers for CRM comboboxes: sort_order ascending (nulls last), then payer_name.
 * Call from server after admin auth; uses service role.
 */
export async function listInsurancePayers(): Promise<InsurancePayer[]> {
  const { data, error } = await supabaseAdmin
    .from("insurance_payers")
    .select("id, payer_name, normalized_name, payer_type, sort_order, is_active")
    .eq("is_active", true)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("payer_name", { ascending: true });

  if (error) {
    console.warn("[crm] listInsurancePayers:", error.message);
    return [];
  }

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

export type QuickAddInsurancePayerOptions = {
  payerType?: string | null;
  createdBy?: string | null;
};

/**
 * Trims name, normalizes via DB generated column; returns existing row on duplicate normalized_name.
 */
export async function quickAddInsurancePayer(
  payerName: string,
  options?: QuickAddInsurancePayerOptions
): Promise<{ ok: true; payer: InsurancePayer } | { ok: false; error: string }> {
  const trimmed = payerName.trim();
  if (!trimmed) {
    return { ok: false, error: "blank" };
  }
  const normalized = trimmed.toLowerCase();

  const { data: existing, error: existingErr } = await supabaseAdmin
    .from("insurance_payers")
    .select("id, payer_name, normalized_name, payer_type, sort_order, is_active")
    .eq("normalized_name", normalized)
    .maybeSingle();

  if (existingErr) {
    console.warn("[crm] quickAddInsurancePayer lookup:", existingErr.message);
    return { ok: false, error: "lookup_failed" };
  }

  if (existing) {
    return { ok: true, payer: mapRow(existing as Record<string, unknown>) };
  }

  const payerType =
    typeof options?.payerType === "string" && options.payerType.trim() ? options.payerType.trim() : null;
  const createdBy =
    typeof options?.createdBy === "string" && options.createdBy.trim() ? options.createdBy.trim() : null;

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from("insurance_payers")
    .insert({
      payer_name: trimmed,
      payer_type: payerType,
      is_active: true,
      created_by: createdBy,
    })
    .select("id, payer_name, normalized_name, payer_type, sort_order, is_active")
    .single();

  if (insertErr) {
    if (insertErr.code === "23505") {
      const { data: retry, error: retryErr } = await supabaseAdmin
        .from("insurance_payers")
        .select("id, payer_name, normalized_name, payer_type, sort_order, is_active")
        .eq("normalized_name", normalized)
        .maybeSingle();
      if (!retryErr && retry) {
        return { ok: true, payer: mapRow(retry as Record<string, unknown>) };
      }
    }
    console.warn("[crm] quickAddInsurancePayer insert:", insertErr.message);
    return { ok: false, error: "insert_failed" };
  }

  if (!inserted) {
    return { ok: false, error: "insert_failed" };
  }

  return { ok: true, payer: mapRow(inserted as Record<string, unknown>) };
}
