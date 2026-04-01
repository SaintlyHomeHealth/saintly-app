"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  isContractingStatus,
  isCredentialingStatus,
} from "@/lib/crm/credentialing-status-options";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

function readTrimmed(formData: FormData, key: string): string | null {
  const v = formData.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function createPayerCredentialingRecord(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false as const, error: "forbidden" };
  }

  const payer_name = readTrimmed(formData, "payer_name");
  if (!payer_name) {
    return { ok: false as const, error: "name_required" };
  }

  const cred = readTrimmed(formData, "credentialing_status") ?? "in_progress";
  const cont = readTrimmed(formData, "contracting_status") ?? "pending";
  if (!isCredentialingStatus(cred) || !isContractingStatus(cont)) {
    return { ok: false as const, error: "invalid_status" };
  }

  const { data, error } = await supabaseAdmin
    .from("payer_credentialing_records")
    .insert({
      payer_name,
      payer_type: readTrimmed(formData, "payer_type"),
      market_state: readTrimmed(formData, "market_state"),
      credentialing_status: cred,
      contracting_status: cont,
      portal_url: readTrimmed(formData, "portal_url"),
      portal_username_hint: readTrimmed(formData, "portal_username_hint"),
      primary_contact_name: readTrimmed(formData, "primary_contact_name"),
      primary_contact_phone: readTrimmed(formData, "primary_contact_phone"),
      primary_contact_email: readTrimmed(formData, "primary_contact_email"),
      notes: readTrimmed(formData, "notes"),
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    console.warn("[credentialing] create:", error?.message);
    return { ok: false as const, error: "insert_failed" };
  }

  revalidatePath("/admin/credentialing");
  return { ok: true as const, id: String(data.id) };
}

export async function submitNewPayerCredentialingForm(formData: FormData) {
  const res = await createPayerCredentialingRecord(formData);
  if (!res.ok) {
    redirect(`/admin/credentialing/new?error=${res.error}`);
  }
  redirect(`/admin/credentialing/${res.id}`);
}

export async function updatePayerCredentialingRecord(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return;
  }

  const id = readTrimmed(formData, "id");
  if (!id) return;

  const cred = readTrimmed(formData, "credentialing_status");
  const cont = readTrimmed(formData, "contracting_status");
  if (cred && !isCredentialingStatus(cred)) return;
  if (cont && !isContractingStatus(cont)) return;

  const payload: Record<string, unknown> = {
    payer_name: readTrimmed(formData, "payer_name"),
    payer_type: readTrimmed(formData, "payer_type"),
    market_state: readTrimmed(formData, "market_state"),
    portal_url: readTrimmed(formData, "portal_url"),
    portal_username_hint: readTrimmed(formData, "portal_username_hint"),
    primary_contact_name: readTrimmed(formData, "primary_contact_name"),
    primary_contact_phone: readTrimmed(formData, "primary_contact_phone"),
    primary_contact_email: readTrimmed(formData, "primary_contact_email"),
    notes: readTrimmed(formData, "notes"),
  };
  if (cred) payload.credentialing_status = cred;
  if (cont) payload.contracting_status = cont;

  if (formData.get("mark_follow_up_now") === "1") {
    payload.last_follow_up_at = new Date().toISOString();
  }

  const { error } = await supabaseAdmin.from("payer_credentialing_records").update(payload).eq("id", id);
  if (error) {
    console.warn("[credentialing] update:", error.message);
    return;
  }

  revalidatePath("/admin/credentialing");
  revalidatePath(`/admin/credentialing/${id}`);
}
