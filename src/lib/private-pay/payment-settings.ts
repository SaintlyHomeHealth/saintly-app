import { PRIVATE_PAY_BUSINESS } from "@/lib/private-pay/constants";

export const PRIVATE_PAY_SETTINGS_ID = "default" as const;

export const DEFAULT_ZELLE_NAME = "Saintly Home Health LLC";
export const DEFAULT_CHECK_PAYABLE_TO = "Saintly Home Health LLC";

export type PrivatePayPreferredPaymentMethod = "zelle";

/** Raw row from `private_pay_settings` (nullable text = use env fallback when empty). */
export type PrivatePaySettingsRow = {
  id: string;
  zelle_name: string | null;
  zelle_phone: string | null;
  zelle_email: string | null;
  cashapp_tag: string | null;
  apple_cash_phone: string | null;
  apple_cash_email: string | null;
  check_payable_to: string | null;
  mailing_address: string | null;
  manual_note: string | null;
  show_zelle: boolean;
  show_cashapp: boolean;
  show_apple_cash: boolean;
  show_cash_check: boolean;
  show_stripe: boolean;
  preferred_payment_method: PrivatePayPreferredPaymentMethod;
  updated_at: string;
  updated_by: string | null;
};

/** Posted from the admin Payment Settings form. */
export type PrivatePaySettingsInput = {
  zelle_name: string;
  zelle_phone: string;
  zelle_email: string;
  cashapp_tag: string;
  apple_cash_phone: string;
  apple_cash_email: string;
  check_payable_to: string;
  mailing_address: string;
  manual_note: string;
  show_zelle: boolean;
  show_cashapp: boolean;
  show_apple_cash: boolean;
  show_cash_check: boolean;
  show_stripe: boolean;
  preferred_payment_method: PrivatePayPreferredPaymentMethod;
};

export type PrivatePayInstructionGroup = {
  method: string;
  lines: string[];
};

export type PrivatePayPaymentSettings = {
  preferredPayment: PrivatePayPreferredPaymentMethod;
  showZelle: boolean;
  showCashApp: boolean;
  showAppleCash: boolean;
  showCashCheck: boolean;
  showStripe: boolean;
  zelle: {
    name: string;
    phone: string;
    email: string;
    sendToLines: string[];
  };
  cashApp: {
    tag: string;
    display: string;
  };
  appleCash: {
    phone: string;
    email: string;
    sendToLines: string[];
  };
  check: {
    payableTo: string;
    mailingAddress: string;
  };
  manualNote: string;
  contactLine: string;
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

function envOr(names: string[]): string {
  for (const name of names) {
    const v = env(name);
    if (v) return v;
  }
  return "";
}

function pickField(dbValue: string | null | undefined, envNames: string | string[], fallback = ""): string {
  const fromDb = (dbValue ?? "").trim();
  if (fromDb) return fromDb;
  const names = Array.isArray(envNames) ? envNames : [envNames];
  const fromEnv = envOr(names);
  if (fromEnv) return fromEnv;
  return fallback;
}

function formatCashAppDisplay(rawTag: string): string {
  const tag = rawTag.trim();
  if (!tag) return "";
  return tag.startsWith("$") ? tag : `$${tag}`;
}

/**
 * Merge Supabase settings (when present) with env fallbacks.
 * Non-empty DB fields win; empty DB fields fall through to env, then defaults.
 */
export function resolvePrivatePayPaymentSettings(row: PrivatePaySettingsRow | null): PrivatePayPaymentSettings {
  const zelleName = pickField(row?.zelle_name, "PRIVATE_PAY_ZELLE_NAME", DEFAULT_ZELLE_NAME);
  const zellePhone = pickField(row?.zelle_phone, "PRIVATE_PAY_ZELLE_PHONE");
  const zelleEmail = pickField(row?.zelle_email, "PRIVATE_PAY_ZELLE_EMAIL");
  const zelleSendTo = [zelleName, zellePhone, zelleEmail].filter(Boolean);

  const rawTag = pickField(row?.cashapp_tag, ["PRIVATE_PAY_CASHAPP_TAG", "PRIVATE_PAY_CASHAPP_CASHTAG"]);
  const cashTag = formatCashAppDisplay(rawTag);

  const applePhone = pickField(row?.apple_cash_phone, "PRIVATE_PAY_APPLE_CASH_PHONE");
  const appleEmail = pickField(row?.apple_cash_email, "PRIVATE_PAY_APPLE_CASH_EMAIL");
  const appleSendTo = [applePhone, appleEmail].filter(Boolean);

  const payableTo = pickField(row?.check_payable_to, "PRIVATE_PAY_CHECK_PAYABLE_TO", DEFAULT_CHECK_PAYABLE_TO);
  const mailingAddress = pickField(row?.mailing_address, [
    "PRIVATE_PAY_MAILING_ADDRESS",
    "PRIVATE_PAY_PAYMENT_ADDRESS",
  ]);
  const manualNote = pickField(row?.manual_note, [
    "PRIVATE_PAY_MANUAL_PAYMENT_NOTE",
    "PRIVATE_PAY_CUSTOM_INSTRUCTIONS",
  ]);

  const hasRow = Boolean(row);

  return {
    preferredPayment: row?.preferred_payment_method ?? "zelle",
    showZelle: hasRow ? Boolean(row!.show_zelle) : true,
    showCashApp: hasRow ? Boolean(row!.show_cashapp) : true,
    showAppleCash: hasRow ? Boolean(row!.show_apple_cash) : true,
    showCashCheck: hasRow ? Boolean(row!.show_cash_check) : true,
    showStripe: hasRow ? Boolean(row!.show_stripe) : true,
    zelle: { name: zelleName, phone: zellePhone, email: zelleEmail, sendToLines: zelleSendTo },
    cashApp: { tag: rawTag, display: cashTag },
    appleCash: { phone: applePhone, email: appleEmail, sendToLines: appleSendTo },
    check: { payableTo, mailingAddress },
    manualNote,
    contactLine: `${PRIVATE_PAY_BUSINESS.legalName} · ${PRIVATE_PAY_BUSINESS.phoneDisplay}`,
  };
}

export function privatePaySettingsInputFromRow(row: PrivatePaySettingsRow | null): PrivatePaySettingsInput {
  const resolved = resolvePrivatePayPaymentSettings(row);
  return {
    zelle_name: resolved.zelle.name,
    zelle_phone: resolved.zelle.phone,
    zelle_email: resolved.zelle.email,
    cashapp_tag: resolved.cashApp.tag,
    apple_cash_phone: resolved.appleCash.phone,
    apple_cash_email: resolved.appleCash.email,
    check_payable_to: resolved.check.payableTo,
    mailing_address: resolved.check.mailingAddress,
    manual_note: resolved.manualNote,
    show_zelle: resolved.showZelle,
    show_cashapp: resolved.showCashApp,
    show_apple_cash: resolved.showAppleCash,
    show_cash_check: resolved.showCashCheck,
    show_stripe: resolved.showStripe,
    preferred_payment_method: resolved.preferredPayment,
  };
}

export function paymentInstructionsFromSettings(settings: PrivatePayPaymentSettings): PrivatePayInstructionGroup[] {
  const groups: PrivatePayInstructionGroup[] = [];

  if (settings.showZelle && settings.zelle.sendToLines.length) {
    groups.push({ method: "Zelle (preferred)", lines: settings.zelle.sendToLines });
  }

  if (settings.showCashApp && settings.cashApp.display) {
    groups.push({ method: "Cash App", lines: [settings.cashApp.display] });
  }

  if (settings.showAppleCash && settings.appleCash.sendToLines.length) {
    groups.push({ method: "Apple Cash", lines: settings.appleCash.sendToLines });
  }

  if (settings.showCashCheck) {
    const checkLines = [`Payable to: ${settings.check.payableTo}`];
    if (settings.check.mailingAddress) checkLines.push(settings.check.mailingAddress);
    groups.push({ method: "Check", lines: checkLines });
  }

  if (settings.manualNote) groups.push({ method: "Note", lines: [settings.manualNote] });

  return groups;
}

export function hasPrivatePayPaymentInstructions(settings: PrivatePayPaymentSettings): boolean {
  return paymentInstructionsFromSettings(settings).length > 0;
}
