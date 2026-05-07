/**
 * Credentialing payer / carrier contacts (multi-row on payer_credentialing_record_contacts).
 */
export type PayerCredentialingRecordContact = {
  id: string;
  credentialing_record_id?: string;
  name: string | null;
  role: string | null;
  email: string | null;
  phone: string | null;
  extension: string | null;
  label: string | null;
  notes: string | null;
  is_primary: boolean;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
};

/** Lightweight shape for credentialing list / reachability helpers. */
export type PayerCredentialingContactReachRow = {
  email: string | null;
  phone: string | null;
  is_active: boolean;
};

export function activePayerCredentialingContacts<T extends { is_active: boolean }>(rows: T[]): T[] {
  return rows.filter((r) => r.is_active);
}

export function sortPayerCredentialingContactsForDisplay<T extends PayerCredentialingRecordContact>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    if (a.is_primary !== b.is_primary) return a.is_primary ? -1 : 1;
    const ao = Number.isFinite(a.sort_order) ? a.sort_order : 0;
    const bo = Number.isFinite(b.sort_order) ? b.sort_order : 0;
    if (ao !== bo) return ao - bo;
    const ac = a.created_at ?? "";
    const bc = b.created_at ?? "";
    return ac.localeCompare(bc);
  });
}

export function contactRowHasIdentifier(c: {
  name: string | null | undefined;
  email: string | null | undefined;
  phone: string | null | undefined;
}): boolean {
  return (
    !!(c.name && c.name.trim()) || !!(c.email && c.email.trim()) || !!(c.phone && c.phone.trim())
  );
}

export function mapPayerCredentialingContactRow(raw: Record<string, unknown>): PayerCredentialingRecordContact {
  return {
    id: String(raw.id ?? ""),
    name: typeof raw.name === "string" ? raw.name : null,
    role: typeof raw.role === "string" ? raw.role : null,
    email: typeof raw.email === "string" ? raw.email : null,
    phone: typeof raw.phone === "string" ? raw.phone : null,
    extension: typeof raw.extension === "string" ? raw.extension : null,
    label: typeof raw.label === "string" ? raw.label : null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    is_primary: raw.is_primary === true,
    is_active: raw.is_active !== false,
    sort_order: typeof raw.sort_order === "number" ? raw.sort_order : Number(raw.sort_order) || 0,
    created_at: typeof raw.created_at === "string" ? raw.created_at : undefined,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : undefined,
  };
}
