import "server-only";

import { loadPrivatePayPaymentSettings } from "@/lib/private-pay/settings-data";
import {
  hasPrivatePayPaymentInstructions,
  paymentInstructionsFromSettings,
  type PrivatePayInstructionGroup,
  type PrivatePayPaymentSettings,
} from "@/lib/private-pay/payment-settings";

export type {
  PrivatePayInstructionGroup,
  PrivatePayPaymentSettings,
  PrivatePaySettingsInput,
  PrivatePaySettingsRow,
} from "@/lib/private-pay/payment-settings";

export { privatePaySettingsInputFromRow, resolvePrivatePayPaymentSettings } from "@/lib/private-pay/payment-settings";

export async function getPrivatePayPaymentSettings(): Promise<PrivatePayPaymentSettings> {
  return loadPrivatePayPaymentSettings();
}

export async function getPrivatePayPaymentInstructions(): Promise<PrivatePayInstructionGroup[]> {
  const settings = await loadPrivatePayPaymentSettings();
  return paymentInstructionsFromSettings(settings);
}

export async function hasPrivatePayPaymentInstructionsConfigured(): Promise<boolean> {
  const settings = await loadPrivatePayPaymentSettings();
  return hasPrivatePayPaymentInstructions(settings);
}
