/**
 * Credentialing payer / carrier contacts (multi-row on payer_credentialing_record_contacts).
 */
export type PayerCredentialingRecordContact = {
  id: string;
  credentialing_record_id?: string;
  name: string | null;
  role: string | null;
  email: string | null;
  /** Legacy column; mirrors `officePhone` on write for older readers */
  phone: string | null;
  officePhone: string | null;
  mobilePhone: string | null;
  otherPhone: string | null;
  otherPhoneLabel: string | null;
  fax: string | null;
  secondaryEmail: string | null;
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
  secondaryEmail?: string | null;
  phone: string | null;
  officePhone?: string | null;
  mobilePhone?: string | null;
  otherPhone?: string | null;
  fax?: string | null;
  is_active: boolean;
};

export function contactEffectiveOfficePhone(c: Pick<PayerCredentialingRecordContact, "officePhone" | "phone">): string | null {
  const o = c.officePhone?.trim() ?? "";
  if (o) return o;
  const legacy = c.phone?.trim() ?? "";
  return legacy || null;
}

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
  phone?: string | null | undefined;
  officePhone?: string | null | undefined;
  mobilePhone?: string | null | undefined;
  otherPhone?: string | null | undefined;
  fax?: string | null | undefined;
  secondaryEmail?: string | null | undefined;
}): boolean {
  const phoneish =
    !!(c.phone && c.phone.trim()) ||
    !!(c.officePhone && c.officePhone.trim()) ||
    !!(c.mobilePhone && c.mobilePhone.trim()) ||
    !!(c.otherPhone && c.otherPhone.trim()) ||
    !!(c.fax && c.fax.trim());
  return (
    !!(c.name && c.name.trim()) ||
    !!(c.email && c.email.trim()) ||
    !!(c.secondaryEmail && c.secondaryEmail.trim()) ||
    phoneish
  );
}

function strCol(raw: Record<string, unknown>, key: string): string | null {
  const v = raw[key];
  return typeof v === "string" ? v : null;
}

export function mapPayerCredentialingContactRow(raw: Record<string, unknown>): PayerCredentialingRecordContact {
  return {
    id: String(raw.id ?? ""),
    name: strCol(raw, "name"),
    role: strCol(raw, "role"),
    email: strCol(raw, "email"),
    phone: strCol(raw, "phone"),
    officePhone: strCol(raw, "office_phone"),
    mobilePhone: strCol(raw, "mobile_phone"),
    otherPhone: strCol(raw, "other_phone"),
    otherPhoneLabel: strCol(raw, "other_phone_label"),
    fax: strCol(raw, "fax"),
    secondaryEmail: strCol(raw, "secondary_email"),
    extension: strCol(raw, "extension"),
    label: strCol(raw, "label"),
    notes: strCol(raw, "notes"),
    is_primary: raw.is_primary === true,
    is_active: raw.is_active !== false,
    sort_order: typeof raw.sort_order === "number" ? raw.sort_order : Number(raw.sort_order) || 0,
    created_at: typeof raw.created_at === "string" ? raw.created_at : undefined,
    updated_at: typeof raw.updated_at === "string" ? raw.updated_at : undefined,
  };
}
