/** Optional labels for payer credentialing contact emails (stored as free text; these are presets in UI). */
export const PAYER_CRED_EMAIL_LABEL_PRESETS = [
  { value: "", label: "No label" },
  { value: "credentialing", label: "Credentialing" },
  { value: "contracting", label: "Contracting" },
  { value: "provider_relations", label: "Provider relations" },
  { value: "escalation", label: "Escalation" },
  { value: "market_updates", label: "Market updates" },
  { value: "other", label: "Other" },
] as const;

export type PayerCredentialingRecordEmail = {
  id: string;
  email: string;
  label: string | null;
  is_primary: boolean;
  sort_order?: number;
};

export function payerCredentialEmailLabelDisplay(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const found = PAYER_CRED_EMAIL_LABEL_PRESETS.find((p) => p.value === raw.trim());
  return found ? found.label : raw.trim();
}
