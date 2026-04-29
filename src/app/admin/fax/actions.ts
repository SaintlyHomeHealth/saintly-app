"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { createReferralLeadFromFax, recordFaxEvent, type FaxCategory } from "@/lib/fax/fax-service";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

const VALID_CATEGORIES = new Set<FaxCategory>([
  "referral",
  "orders",
  "signed_docs",
  "insurance",
  "marketing",
  "misc",
]);

async function requireFaxAdmin() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) redirect("/admin");
  return staff;
}

async function requireFaxSupervisionAdmin() {
  const staff = await getStaffProfile();
  if (!staff || !isAdminOrHigher(staff)) redirect("/admin/fax");
  return staff;
}

function readString(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function returnTo(formData: FormData, fallback: string): string {
  const raw = readString(formData, "returnTo");
  return raw.startsWith("/admin/fax") ? raw : fallback;
}

async function updateFaxAndEvent(input: {
  faxId: string;
  patch: Record<string, unknown>;
  eventType: string;
  payload?: Record<string, unknown>;
  returnToPath: string;
}) {
  const staff = await requireFaxAdmin();
  if (!input.faxId) redirect(input.returnToPath);

  await supabaseAdmin.from("fax_messages").update(input.patch).eq("id", input.faxId);
  await recordFaxEvent({
    faxMessageId: input.faxId,
    eventType: input.eventType,
    payload: { ...(input.payload ?? {}), actor_user_id: staff.user_id },
  });
  revalidatePath("/admin/fax");
  revalidatePath(`/admin/fax/${input.faxId}`);
  redirect(input.returnToPath);
}

export async function markFaxReadAction(formData: FormData) {
  const faxId = readString(formData, "faxId");
  const isRead = readString(formData, "isRead") === "1";
  await updateFaxAndEvent({
    faxId,
    patch: { is_read: isRead },
    eventType: isRead ? "viewed" : "marked_unread",
    returnToPath: returnTo(formData, `/admin/fax/${faxId}`),
  });
}

export async function archiveFaxAction(formData: FormData) {
  const faxId = readString(formData, "faxId");
  const archived = readString(formData, "archived") === "1";
  await updateFaxAndEvent({
    faxId,
    patch: archived ? { is_archived: true, status: "archived" } : { is_archived: false },
    eventType: archived ? "archived" : "unarchived",
    returnToPath: returnTo(formData, "/admin/fax"),
  });
}

export async function softDeleteFaxAction(formData: FormData) {
  const faxId = readString(formData, "faxId");
  const path = returnTo(formData, "/admin/fax");
  const staff = await requireFaxAdmin();
  if (!faxId) redirect(path);

  await supabaseAdmin.from("fax_messages").update({ is_archived: true, status: "archived" }).eq("id", faxId);
  console.log("[fax/delete] soft_delete", { fax_id: faxId, actor_user_id: staff.user_id });
  await recordFaxEvent({
    faxMessageId: faxId,
    eventType: "deleted_soft",
    payload: { actor_user_id: staff.user_id },
  });
  revalidatePath("/admin/fax");
  revalidatePath(`/admin/fax/${faxId}`);
  redirect(path);
}

export async function hardDeleteFaxAction(formData: FormData) {
  const faxId = readString(formData, "faxId");
  const path = returnTo(formData, "/admin/fax");
  const staff = await requireFaxSupervisionAdmin();
  if (!faxId) redirect(path);

  const { data: fax, error: faxError } = await supabaseAdmin
    .from("fax_messages")
    .select("id, storage_path")
    .eq("id", faxId)
    .maybeSingle();
  if (faxError || !fax?.id) redirect(path);

  const storagePath =
    typeof fax.storage_path === "string" && fax.storage_path.trim() ? fax.storage_path.trim() : null;
  if (storagePath) {
    await supabaseAdmin.storage.from("fax-documents").remove([storagePath]);
  }

  await supabaseAdmin.from("fax_messages").delete().eq("id", faxId);
  console.log("[fax/delete] hard_delete", {
    fax_id: faxId,
    actor_user_id: staff.user_id,
    storage_path: storagePath,
  });
  revalidatePath("/admin/fax");
  revalidatePath(`/admin/fax/${faxId}`);
  redirect(path);
}

export async function updateFaxCategoryAction(formData: FormData) {
  const faxId = readString(formData, "faxId");
  const raw = readString(formData, "category");
  const category = VALID_CATEGORIES.has(raw as FaxCategory) ? (raw as FaxCategory) : "misc";
  await updateFaxAndEvent({
    faxId,
    patch: { category },
    eventType: "category_changed",
    payload: { category },
    returnToPath: returnTo(formData, `/admin/fax/${faxId}`),
  });
}

export async function updateFaxTagsAction(formData: FormData) {
  const faxId = readString(formData, "faxId");
  const tags = readString(formData, "tags")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 16);
  await updateFaxAndEvent({
    faxId,
    patch: { tags },
    eventType: "tags_changed",
    payload: { tags },
    returnToPath: returnTo(formData, `/admin/fax/${faxId}`),
  });
}

export async function assignFaxOwnerAction(formData: FormData) {
  const faxId = readString(formData, "faxId");
  const assignedTo = readString(formData, "assigned_to_user_id") || null;
  await updateFaxAndEvent({
    faxId,
    patch: { assigned_to_user_id: assignedTo },
    eventType: "assigned",
    payload: { assigned_to_user_id: assignedTo },
    returnToPath: returnTo(formData, `/admin/fax/${faxId}`),
  });
}

export async function attachFaxRecordAction(formData: FormData) {
  const faxId = readString(formData, "faxId");
  const selected = readString(formData, "match_id");
  const [selectedKind, selectedId] = selected.includes(":") ? selected.split(":", 2) : ["", selected];
  const kind = selectedKind || readString(formData, "match_kind");
  const id = selectedId || null;
  const patch: Record<string, unknown> = {};
  if (kind === "lead") patch.lead_id = id;
  if (kind === "patient") patch.patient_id = id;
  if (kind === "facility") patch.facility_id = id;
  await updateFaxAndEvent({
    faxId,
    patch,
    eventType: "manual_match_attached",
    payload: { kind, id },
    returnToPath: returnTo(formData, `/admin/fax/${faxId}`),
  });
}

export async function createLeadFromFaxAction(formData: FormData) {
  const staff = await requireFaxAdmin();
  const faxId = readString(formData, "faxId");
  const result = await createReferralLeadFromFax({
    faxId,
    firstName: readString(formData, "firstName"),
    lastName: readString(formData, "lastName"),
    dob: readString(formData, "dob") || null,
    phone: readString(formData, "phone") || null,
    address: readString(formData, "address") || null,
    insurance: readString(formData, "insurance") || null,
    doctor: readString(formData, "doctor") || null,
    notes: readString(formData, "notes") || null,
    actorUserId: staff.user_id,
  });
  revalidatePath("/admin/fax");
  revalidatePath(`/admin/fax/${faxId}`);
  if (result.ok && result.leadId) redirect(`/admin/crm/leads/${result.leadId}`);
  redirect(`/admin/fax/${faxId}?leadError=${encodeURIComponent(result.error ?? "Lead creation failed")}`);
}
