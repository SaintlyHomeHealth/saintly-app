import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { conversationLeadStatusDisplayLabel } from "@/lib/phone/conversation-lead-status";

export type ContactAddressFields = {
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

export function formatContactAddress(c: ContactAddressFields): string | null {
  const line1 = typeof c.address_line_1 === "string" ? c.address_line_1.trim() : "";
  const line2 = typeof c.address_line_2 === "string" ? c.address_line_2.trim() : "";
  const city = typeof c.city === "string" ? c.city.trim() : "";
  const state = typeof c.state === "string" ? c.state.trim() : "";
  const zip = typeof c.zip === "string" ? c.zip.trim() : "";
  const cityStateZip = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const parts = [line1, line2, cityStateZip].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export function displayNameFromContact(
  c: {
    full_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
  } | null
): string {
  if (!c) return "Patient";
  const fn = typeof c.full_name === "string" ? c.full_name.trim() : "";
  if (fn) return fn;
  const a = typeof c.first_name === "string" ? c.first_name : "";
  const b = typeof c.last_name === "string" ? c.last_name : "";
  const parts = [a, b].filter(Boolean).join(" ").trim();
  return parts || "Patient";
}

export function leadChipLabel(raw: unknown): string {
  return conversationLeadStatusDisplayLabel(typeof raw === "string" ? raw : null);
}

export { formatAdminPhoneWhen };
