import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  executeQuickSaveContact,
  parseQuickSaveKind,
  reclassifyContactByQuickKind,
} from "@/lib/crm/quick-save-contact";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

function revalidatePhoneCrm() {
  revalidatePath("/workspace/phone/calls");
  revalidatePath("/workspace/phone/keypad");
  revalidatePath("/workspace/phone/leads");
  revalidatePath("/admin/phone");
  revalidatePath("/admin/crm/contacts");
  revalidatePath("/admin/crm/leads");
}

export async function POST(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const phone = typeof b.phone === "string" ? b.phone : "";
  const name = typeof b.name === "string" ? b.name : "";
  const notes = typeof b.notes === "string" ? b.notes : "";
  const phoneCallId = typeof b.phoneCallId === "string" ? b.phoneCallId : null;
  const kind = parseQuickSaveKind(b.kind) ?? "contact";

  const res = await executeQuickSaveContact(supabaseAdmin, staff, {
    rawPhone: phone,
    name,
    notes,
    kind,
    phoneCallId,
  });

  if (res.ok === false) {
    return NextResponse.json(
      { ok: false, error: res.error, message: res.message },
      { status: res.error === "invalid_phone" || res.error === "missing_phone" ? 400 : 500 }
    );
  }

  if (res.ok === "duplicate") {
    return NextResponse.json({
      ok: "duplicate",
      contact: {
        id: res.contact.id,
        displayName:
          (res.contact.full_name ?? "").trim() ||
          [res.contact.first_name, res.contact.last_name].filter(Boolean).join(" ").trim() ||
          (res.contact.organization_name ?? "").trim() ||
          res.contact.primary_phone,
        contactType: res.contact.contact_type,
        hasActiveLead: Boolean(res.activeLeadId),
        hasPatient: Boolean(res.patientId),
      },
    });
  }

  revalidatePhoneCrm();
  return NextResponse.json({
    ok: true,
    contactId: res.contactId,
    displayName: res.displayName,
    e164: res.e164,
    kind: res.kind,
    leadId: res.leadId,
    patientId: res.patientId,
  });
}

export async function PATCH(req: NextRequest) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const b = body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const contactId = typeof b.contactId === "string" ? b.contactId : "";
  const kind = parseQuickSaveKind(b.kind);
  if (!contactId || !kind) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  const res = await reclassifyContactByQuickKind(supabaseAdmin, staff, { contactId, kind });
  if (!res.ok) {
    return NextResponse.json(
      { ok: false, error: res.error, message: res.message },
      { status: res.error === "not_found" ? 404 : 400 }
    );
  }
  revalidatePhoneCrm();
  return NextResponse.json({
    ok: true,
    contactId: res.contactId,
    leadId: res.leadId,
    patientId: res.patientId,
  });
}
