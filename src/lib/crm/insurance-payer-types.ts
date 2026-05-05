/**
 * Serializable insurance payer catalog row — safe for client components (no server imports).
 */
export type InsurancePayer = {
  id: string;
  payer_name: string;
  normalized_name: string;
  payer_type: string | null;
  is_active: boolean;
  sort_order: number | null;
};
