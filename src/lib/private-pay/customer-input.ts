import { normalizeUsPhoneForSend } from "@/lib/phone/us-phone-format";

export type PrivatePayCustomerFormInput = {
  first_name?: string;
  last_name?: string;
  phone?: string;
  email?: string;
  address_line_1?: string;
  address_line_2?: string;
  city?: string;
  state?: string;
  zip?: string;
  notes?: string;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidPrivatePayEmail(value: string | null | undefined): boolean {
  const email = (value ?? "").trim();
  if (!email) return true;
  return EMAIL_RE.test(email);
}

export function validatePrivatePayCustomerInput(
  input: PrivatePayCustomerFormInput
): { ok: true; normalized: Required<Pick<PrivatePayCustomerFormInput, "phone">> & PrivatePayCustomerFormInput } | { ok: false; error: string } {
  const first_name = (input.first_name ?? "").trim();
  const last_name = (input.last_name ?? "").trim();
  const phoneDigits = normalizeUsPhoneForSend(input.phone ?? "");
  const email = (input.email ?? "").trim();

  if (!first_name && !last_name) {
    return { ok: false, error: "Enter a first or last name." };
  }
  if (phoneDigits.length !== 10) {
    return { ok: false, error: "Enter a valid 10-digit US phone number." };
  }
  if (email && !isValidPrivatePayEmail(email)) {
    return { ok: false, error: "Enter a valid email address." };
  }

  return {
    ok: true,
    normalized: {
      first_name,
      last_name,
      phone: phoneDigits,
      email,
      address_line_1: (input.address_line_1 ?? "").trim(),
      address_line_2: (input.address_line_2 ?? "").trim(),
      city: (input.city ?? "").trim(),
      state: (input.state ?? "").trim(),
      zip: (input.zip ?? "").trim(),
      notes: (input.notes ?? "").trim(),
    },
  };
}
