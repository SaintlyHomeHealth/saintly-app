import type { SupabaseClient } from "@supabase/supabase-js";

import { normalizePhone } from "@/lib/phone/us-phone-format";

export type PatientReferralDuplicateMatchReason =
  | "dob_last_name"
  | "phone"
  | "mbi"
  | "member_id"
  | "authorization_number"
  | "name_dob"
  | "name_address";

export type PatientReferralDuplicateRow = {
  patient_id: string;
  contact_id: string;
  full_name: string;
  phone: string | null;
  date_of_birth: string | null;
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  patient_status: string;
  intake_status: string | null;
  reasons: PatientReferralDuplicateMatchReason[];
};

type Agg = {
  row: Omit<PatientReferralDuplicateRow, "reasons">;
  dobLast: boolean;
  phone: boolean;
  mbi: boolean;
  memberId: boolean;
  authNum: boolean;
  nameDob: boolean;
  nameAddr: boolean;
};

function finalizeReasons(a: Agg): PatientReferralDuplicateMatchReason[] {
  const out: PatientReferralDuplicateMatchReason[] = [];
  if (a.dobLast) out.push("dob_last_name");
  if (a.phone) out.push("phone");
  if (a.mbi) out.push("mbi");
  if (a.memberId) out.push("member_id");
  if (a.authNum) out.push("authorization_number");
  if (a.nameDob) out.push("name_dob");
  if (a.nameAddr) out.push("name_address");
  return out;
}

function normalizeNameKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function addressKey(line1: string | null, city: string | null, zip: string | null): string | null {
  const parts = [line1, city, zip].map((p) => (p ?? "").trim().toLowerCase()).filter(Boolean);
  return parts.length >= 2 ? parts.join("|") : null;
}

export function describePatientReferralDuplicateReasons(reasons: PatientReferralDuplicateMatchReason[]): string {
  const labels: Record<PatientReferralDuplicateMatchReason, string> = {
    dob_last_name: "Same DOB + last name",
    phone: "Matching phone",
    mbi: "Matching MBI",
    member_id: "Matching member ID",
    authorization_number: "Matching authorization number",
    name_dob: "Similar name + DOB",
    name_address: "Similar name + address",
  };
  return reasons.map((r) => labels[r] ?? r).join(" · ");
}

export async function findPatientReferralDuplicates(
  supabase: SupabaseClient,
  input: {
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    date_of_birth?: string | null;
    phone?: string | null;
    mbi?: string | null;
    member_id?: string | null;
    authorization_number?: string | null;
    address_line_1?: string | null;
    city?: string | null;
    state?: string | null;
    zip?: string | null;
    excludePatientId?: string | null;
  }
): Promise<PatientReferralDuplicateRow[]> {
  const exclude = input.excludePatientId?.trim() ?? null;
  const agg = new Map<string, Agg>();
  const selectCols = `
    id,
    contact_id,
    patient_status,
    intake_status,
    contacts (
      full_name,
      first_name,
      last_name,
      primary_phone,
      date_of_birth,
      address_line_1,
      city,
      state,
      zip
    )
  `;

  function bump(row: Agg["row"], kind: keyof Omit<Agg, "row">) {
    if (exclude && row.patient_id === exclude) return;
    const prev = agg.get(row.patient_id);
    if (!prev) {
      agg.set(row.patient_id, { row, dobLast: false, phone: false, mbi: false, memberId: false, authNum: false, nameDob: false, nameAddr: false, [kind]: true } as Agg);
      return;
    }
    prev[kind] = true;
  }

  function mapPatientRow(raw: Record<string, unknown>): Agg["row"] | null {
    const contacts = raw.contacts as Record<string, unknown> | Record<string, unknown>[] | null;
    const c = Array.isArray(contacts) ? contacts[0] : contacts;
    if (!c || typeof c !== "object") return null;
    const fn = String(c.full_name ?? "").trim() || [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
    return {
      patient_id: String(raw.id),
      contact_id: String(raw.contact_id),
      full_name: fn || "—",
      phone: typeof c.primary_phone === "string" ? c.primary_phone : null,
      date_of_birth: typeof c.date_of_birth === "string" ? c.date_of_birth : null,
      address_line_1: typeof c.address_line_1 === "string" ? c.address_line_1 : null,
      city: typeof c.city === "string" ? c.city : null,
      state: typeof c.state === "string" ? c.state : null,
      zip: typeof c.zip === "string" ? c.zip : null,
      patient_status: String(raw.patient_status ?? "pending"),
      intake_status: typeof raw.intake_status === "string" ? raw.intake_status : null,
    };
  }

  const np = normalizePhone(input.phone ?? "");
  if (np) {
    const { data: contacts } = await supabase.from("contacts").select("id").eq("primary_phone", np).limit(20);
    const ids = (contacts ?? []).map((c) => String(c.id));
    if (ids.length) {
      const { data: pts } = await supabase.from("patients").select(selectCols).in("contact_id", ids).limit(20);
      for (const r of pts ?? []) {
        const row = mapPatientRow(r as Record<string, unknown>);
        if (row) bump(row, "phone");
      }
    }
  }

  const dob = input.date_of_birth?.trim();
  const lastName = (input.last_name ?? "").trim().toLowerCase();
  if (dob && lastName) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, full_name, first_name, last_name, primary_phone, date_of_birth, address_line_1, city, state, zip")
      .eq("date_of_birth", dob)
      .ilike("last_name", lastName)
      .limit(25);
    const ids = (contacts ?? []).map((c) => String(c.id));
    if (ids.length) {
      const { data: pts } = await supabase.from("patients").select(selectCols).in("contact_id", ids).limit(25);
      for (const r of pts ?? []) {
        const row = mapPatientRow(r as Record<string, unknown>);
        if (row) bump(row, "dobLast");
      }
    }
  }

  const nameKey = normalizeNameKey(input.full_name ?? [input.first_name, input.last_name].filter(Boolean).join(" "));
  const addrK = addressKey(input.address_line_1 ?? null, input.city ?? null, input.zip ?? null);
  if (nameKey && dob) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, full_name, first_name, last_name, primary_phone, date_of_birth, address_line_1, city, state, zip")
      .eq("date_of_birth", dob)
      .limit(50);
    for (const c of contacts ?? []) {
      const fn = String(c.full_name ?? "").trim() || [c.first_name, c.last_name].filter(Boolean).join(" ");
      if (normalizeNameKey(fn) === nameKey) {
        const { data: pts } = await supabase.from("patients").select(selectCols).eq("contact_id", c.id).limit(5);
        for (const r of pts ?? []) {
          const row = mapPatientRow(r as Record<string, unknown>);
          if (row) bump(row, "nameDob");
        }
      }
    }
  }

  if (nameKey && addrK) {
    const { data: contacts } = await supabase
      .from("contacts")
      .select("id, full_name, first_name, last_name, primary_phone, date_of_birth, address_line_1, city, state, zip")
      .limit(100);
    for (const c of contacts ?? []) {
      const fn = String(c.full_name ?? "").trim() || [c.first_name, c.last_name].filter(Boolean).join(" ");
      const cAddr = addressKey(
        typeof c.address_line_1 === "string" ? c.address_line_1 : null,
        typeof c.city === "string" ? c.city : null,
        typeof c.zip === "string" ? c.zip : null
      );
      if (normalizeNameKey(fn) === nameKey && cAddr === addrK) {
        const { data: pts } = await supabase.from("patients").select(selectCols).eq("contact_id", c.id).limit(5);
        for (const r of pts ?? []) {
          const row = mapPatientRow(r as Record<string, unknown>);
          if (row) bump(row, "nameAddr");
        }
      }
    }
  }

  const mbi = input.mbi?.trim().toUpperCase();
  if (mbi) {
    const { data: refs } = await supabase.from("patient_referrals").select("patient_id").eq("mbi", mbi).limit(20);
    const pids = [...new Set((refs ?? []).map((r) => String(r.patient_id)).filter(Boolean))];
    if (pids.length) {
      const { data: pts } = await supabase.from("patients").select(selectCols).in("id", pids).limit(20);
      for (const r of pts ?? []) {
        const row = mapPatientRow(r as Record<string, unknown>);
        if (row) bump(row, "mbi");
      }
    }
    const { data: leads } = await supabase.from("leads").select("contact_id").eq("medicare_number", mbi).limit(10);
    const cids = (leads ?? []).map((l) => String(l.contact_id)).filter(Boolean);
    if (cids.length) {
      const { data: pts } = await supabase.from("patients").select(selectCols).in("contact_id", cids).limit(10);
      for (const r of pts ?? []) {
        const row = mapPatientRow(r as Record<string, unknown>);
        if (row) bump(row, "mbi");
      }
    }
  }

  const memberId = input.member_id?.trim();
  if (memberId) {
    const { data: refs } = await supabase.from("patient_referrals").select("patient_id").eq("member_id", memberId).limit(20);
    const pids = [...new Set((refs ?? []).map((r) => String(r.patient_id)).filter(Boolean))];
    if (pids.length) {
      const { data: pts } = await supabase.from("patients").select(selectCols).in("id", pids).limit(20);
      for (const r of pts ?? []) {
        const row = mapPatientRow(r as Record<string, unknown>);
        if (row) bump(row, "memberId");
      }
    }
  }

  const authNum = input.authorization_number?.trim();
  if (authNum) {
    const { data: refs } = await supabase
      .from("patient_referrals")
      .select("patient_id")
      .eq("authorization_number", authNum)
      .limit(20);
    const pids = [...new Set((refs ?? []).map((r) => String(r.patient_id)).filter(Boolean))];
    if (pids.length) {
      const { data: pts } = await supabase.from("patients").select(selectCols).in("id", pids).limit(20);
      for (const r of pts ?? []) {
        const row = mapPatientRow(r as Record<string, unknown>);
        if (row) bump(row, "authNum");
      }
    }
  }

  const list: PatientReferralDuplicateRow[] = [];
  for (const a of agg.values()) {
    list.push({ ...a.row, reasons: finalizeReasons(a) });
  }
  return list.sort((x, y) => y.reasons.length - x.reasons.length);
}
