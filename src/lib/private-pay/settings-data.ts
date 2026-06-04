import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import {
  PRIVATE_PAY_SETTINGS_ID,
  resolvePrivatePayPaymentSettings,
  type PrivatePayPaymentSettings,
  type PrivatePaySettingsInput,
  type PrivatePaySettingsRow,
} from "@/lib/private-pay/payment-settings";

const SETTINGS_COLUMNS =
  "id, zelle_name, zelle_phone, zelle_email, cashapp_tag, apple_cash_phone, apple_cash_email, check_payable_to, mailing_address, manual_note, show_zelle, show_cashapp, show_apple_cash, show_cash_check, show_stripe, preferred_payment_method, updated_at, updated_by";

export async function getPrivatePaySettingsRow(): Promise<PrivatePaySettingsRow | null> {
  const { data, error } = await supabaseAdmin
    .from("private_pay_settings")
    .select(SETTINGS_COLUMNS)
    .eq("id", PRIVATE_PAY_SETTINGS_ID)
    .maybeSingle();
  if (error) {
    console.error("[private-pay] settings fetch:", error.message);
    return null;
  }
  return (data as PrivatePaySettingsRow | null) ?? null;
}

export async function loadPrivatePayPaymentSettings(): Promise<PrivatePayPaymentSettings> {
  const row = await getPrivatePaySettingsRow();
  return resolvePrivatePayPaymentSettings(row);
}

export async function upsertPrivatePaySettings(
  input: PrivatePaySettingsInput,
  updatedBy: string | null
): Promise<PrivatePaySettingsRow> {
  const payload = {
    id: PRIVATE_PAY_SETTINGS_ID,
    zelle_name: input.zelle_name.trim() || null,
    zelle_phone: input.zelle_phone.trim() || null,
    zelle_email: input.zelle_email.trim() || null,
    cashapp_tag: input.cashapp_tag.trim() || null,
    apple_cash_phone: input.apple_cash_phone.trim() || null,
    apple_cash_email: input.apple_cash_email.trim() || null,
    check_payable_to: input.check_payable_to.trim() || null,
    mailing_address: input.mailing_address.trim() || null,
    manual_note: input.manual_note.trim() || null,
    show_zelle: input.show_zelle,
    show_cashapp: input.show_cashapp,
    show_apple_cash: input.show_apple_cash,
    show_cash_check: input.show_cash_check,
    show_stripe: input.show_stripe,
    preferred_payment_method: input.preferred_payment_method,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };

  const { data, error } = await supabaseAdmin
    .from("private_pay_settings")
    .upsert(payload, { onConflict: "id" })
    .select(SETTINGS_COLUMNS)
    .single();

  if (error || !data) throw new Error(error?.message ?? "Failed to save payment settings.");
  return data as PrivatePaySettingsRow;
}
