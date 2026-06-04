import "server-only";

/**
 * Manual payment instructions are configured via environment variables and only
 * rendered on the invoice / public page when present. Nothing here is PHI.
 *
 * Supported env vars:
 *   PRIVATE_PAY_ZELLE_NAME, PRIVATE_PAY_ZELLE_EMAIL, PRIVATE_PAY_ZELLE_PHONE
 *   PRIVATE_PAY_CASHAPP_CASHTAG
 *   PRIVATE_PAY_APPLE_CASH_PHONE, PRIVATE_PAY_APPLE_CASH_EMAIL
 *   PRIVATE_PAY_CHECK_PAYABLE_TO
 *   PRIVATE_PAY_CUSTOM_INSTRUCTIONS
 */
export type PrivatePayInstructionGroup = {
  method: string;
  lines: string[];
};

function env(name: string): string {
  return (process.env[name] ?? "").trim();
}

/** Returns only the configured manual payment instruction groups. */
export function getPrivatePayPaymentInstructions(): PrivatePayInstructionGroup[] {
  const groups: PrivatePayInstructionGroup[] = [];

  const zelle = [
    env("PRIVATE_PAY_ZELLE_NAME"),
    env("PRIVATE_PAY_ZELLE_EMAIL"),
    env("PRIVATE_PAY_ZELLE_PHONE"),
  ].filter(Boolean);
  if (zelle.length) groups.push({ method: "Zelle", lines: zelle });

  const cashtag = env("PRIVATE_PAY_CASHAPP_CASHTAG");
  if (cashtag) {
    groups.push({ method: "Cash App", lines: [cashtag.startsWith("$") ? cashtag : `$${cashtag}`] });
  }

  const appleCash = [env("PRIVATE_PAY_APPLE_CASH_PHONE"), env("PRIVATE_PAY_APPLE_CASH_EMAIL")].filter(Boolean);
  if (appleCash.length) groups.push({ method: "Apple Cash", lines: appleCash });

  const checkPayable = env("PRIVATE_PAY_CHECK_PAYABLE_TO");
  if (checkPayable) groups.push({ method: "Check", lines: [`Payable to: ${checkPayable}`] });

  const custom = env("PRIVATE_PAY_CUSTOM_INSTRUCTIONS");
  if (custom) groups.push({ method: "Other", lines: [custom] });

  return groups;
}

export function hasPrivatePayPaymentInstructions(): boolean {
  return getPrivatePayPaymentInstructions().length > 0;
}
