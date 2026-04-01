import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";

import {
  findAuthUserIdByEmail,
  normalizeStaffLookupEmail,
  syncStaffProfileWithAuthUser,
  type StaffRowForAuthSync,
} from "@/lib/admin/staff-auth-link";
import { insertAuditLog } from "@/lib/audit-log";
import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

function rowForSync(r: Record<string, unknown>): StaffRowForAuthSync | null {
  const id = typeof r.id === "string" ? r.id : null;
  const role = typeof r.role === "string" ? r.role : null;
  if (!id || !role) return null;
  return {
    id,
    user_id: typeof r.user_id === "string" ? r.user_id : null,
    email: typeof r.email === "string" ? r.email : null,
    role,
    is_active: r.is_active !== false,
    phone_access_enabled: r.phone_access_enabled === true,
    inbound_ring_enabled: r.inbound_ring_enabled === true,
  };
}

export async function POST(req: Request) {
  const actor = await getStaffProfile();
  if (!actor || !isAdminOrHigher(actor)) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { staffProfileId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const staffProfileId =
    typeof body.staffProfileId === "string" ? body.staffProfileId.trim() : "";
  if (!staffProfileId) {
    return NextResponse.json({ ok: false, error: "missing_staff_profile_id" }, { status: 400 });
  }

  const { data: rowRaw, error: loadErr } = await supabaseAdmin
    .from("staff_profiles")
    .select(
      "id, user_id, email, role, is_active, phone_access_enabled, inbound_ring_enabled"
    )
    .eq("id", staffProfileId)
    .maybeSingle();

  if (loadErr || !rowRaw) {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 404 });
  }

  const row = rowForSync(rowRaw as Record<string, unknown>);
  if (!row) {
    return NextResponse.json({ ok: false, error: "load_failed" }, { status: 404 });
  }

  const email = normalizeStaffLookupEmail(row.email);
  if (!email) {
    return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
  }

  const authUserId = await findAuthUserIdByEmail(email);
  if (!authUserId) {
    return NextResponse.json({ ok: false, error: "auth_not_found_for_email" }, { status: 404 });
  }

  const prevUserId = row.user_id;
  const sync = await syncStaffProfileWithAuthUser(row, authUserId);
  if (!sync.ok) {
    return NextResponse.json(
      { ok: false, error: sync.error, detail: sync.detail },
      { status: sync.error === "auth_user_linked_elsewhere" ? 409 : 500 }
    );
  }

  let outcome: string;
  if (!prevUserId) {
    outcome = "login_linked_from_email";
  } else if (prevUserId === authUserId) {
    outcome = "login_link_refreshed";
  } else {
    outcome = "login_reassigned_from_email";
  }

  await insertAuditLog({
    action: "staff.repair_login_link",
    entityType: "staff_profiles",
    entityId: staffProfileId,
    metadata: { email: sync.authEmail, outcome },
  });

  revalidatePath("/admin/staff");
  return NextResponse.json({ ok: true, outcome, authEmail: sync.authEmail });
}
