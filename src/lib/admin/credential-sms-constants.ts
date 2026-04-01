/** Credential types eligible for employee directory SMS reminders (sync with reminder copy). */
export const SMS_REMINDER_CREDENTIAL_TYPES = [
  "professional_license",
  "cpr",
  "tb_expiration",
  "drivers_license",
  "auto_insurance",
  "independent_contractor_insurance",
] as const;

export const SMS_REMINDER_CREDENTIAL_TYPE_SET = new Set<string>(
  SMS_REMINDER_CREDENTIAL_TYPES as unknown as string[]
);
