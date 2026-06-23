"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { supabaseAdmin } from "@/lib/admin";
import { forwardInboundFaxAsOutbound } from "@/lib/fax/forward-inbound-fax";
import { recordFaxEvent } from "@/lib/fax/fax-service";
import type { FaxClonePrefill } from "@/lib/fax/fax-clone-prefill-types";
import { getFaxClonePrefill as loadFaxClonePrefill } from "@/lib/fax/get-fax-clone-prefill";
import { resendOutboundFax } from "@/lib/fax/resend-outbound-fax";
import { getStaffProfile, isAdminOrHigher, isManagerOrHigher } from "@/lib/staff-profile";

const NOTE_MAX_LEN = 4000;

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

export async function updateFaxNoteAction(formData: FormData): Promise<{ ok: true } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "Unauthorized" };
  }

  const faxId = readString(formData, "faxId");
  const rawNote = typeof formData.get("note") === "string" ? formData.get("note") : "";
  const note =
    typeof rawNote === "string" ? rawNote.trim().slice(0, NOTE_MAX_LEN) || null : null;

  if (!faxId) return { ok: false, error: "Missing fax." };

  const { error } = await supabaseAdmin.from("fax_messages").update({ note }).eq("id", faxId);
  if (error) {
    if (error.message?.toLowerCase().includes("column") && error.message?.toLowerCase().includes("note")) {
      return { ok: false, error: "Database migration missing: fax note column (note)." };
    }
    return { ok: false, error: error.message ?? "Update failed." };
  }

  await recordFaxEvent({
    faxMessageId: faxId,
    eventType: "note_updated",
    payload: { actor_user_id: staff.user_id, has_note: Boolean(note) },
  });
  revalidatePath("/admin/fax");
  revalidatePath(`/admin/fax/${faxId}`);
  return { ok: true };
}

export async function getFaxClonePrefill(
  faxId: string
): Promise<{ ok: true; prefill: FaxClonePrefill } | { ok: false; error: string }> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "Unauthorized" };
  }

  return loadFaxClonePrefill(faxId);
}

export async function resendFaxAction(
  faxMessageId: string,
  newRecipientFaxNumber: string
): Promise<
  | { ok: true; newFaxId: string }
  | { ok: false; error: string; newFaxId?: string }
> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "Unauthorized" };
  }

  const fid = faxMessageId.trim();
  if (!fid) {
    return { ok: false, error: "Missing fax." };
  }

  const result = await resendOutboundFax({
    originalFaxMessageId: fid,
    newRecipientRaw: newRecipientFaxNumber,
    actorUserId: staff.user_id,
  });

  revalidatePath("/admin/fax");
  revalidatePath(`/admin/fax/${fid}`);
  if (result.newFaxId) {
    revalidatePath(`/admin/fax/${result.newFaxId}`);
  }

  return result;
}

export async function forwardInboundFaxAction(input: {
  inboundFaxId: string;
  toNumber: string;
  recipientName: string;
  recipientOrganization: string;
  subject: string;
  coverNote: string;
  includeCoverSheet: boolean;
  originalFromDisplay: string;
  originalReceivedDisplay: string;
}): Promise<
  { ok: true; newFaxId: string } | { ok: false; error: string; newFaxId?: string }
> {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false, error: "Unauthorized" };
  }

  const fid = input.inboundFaxId.trim();
  if (!fid) {
    return { ok: false, error: "Missing fax." };
  }

  const result = await forwardInboundFaxAsOutbound({
    inboundFaxMessageId: fid,
    toNumberRaw: input.toNumber,
    recipientName: input.recipientName.trim() || null,
    recipientOrganization: input.recipientOrganization.trim() || null,
    subject: input.subject.trim() || null,
    coverNote: input.coverNote.trim() || null,
    includeCoverSheet: input.includeCoverSheet,
    actorUserId: staff.user_id,
    originalFromDisplay: input.originalFromDisplay,
    originalReceivedDisplay: input.originalReceivedDisplay,
  });

  revalidatePath("/admin/fax");
  revalidatePath(`/admin/fax/${fid}`);
  if (result.newFaxId) {
    revalidatePath(`/admin/fax/${result.newFaxId}`);
  }

  return result;
}
