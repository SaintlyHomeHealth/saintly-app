import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canAccessWorkspaceInternalChat } from "@/lib/internal-chat/workspace-access";
import { displayNameFromContact } from "@/app/workspace/phone/patients/_lib/patient-hub";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspaceInternalChat(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("patient_assignments")
    .select("patient_id, patients ( id, patient_status, archived_at, is_test, contacts ( full_name, first_name, last_name ) )")
    .eq("assigned_user_id", staff.user_id)
    .eq("is_active", true)
    .limit(200);

  if (error) {
    console.warn("[internal-chat/mentionable-patients]", error.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  const patients: Array<{ patientId: string; label: string }> = [];
  for (const row of data ?? []) {
    const p = row.patients as
      | {
          id?: string;
          patient_status?: string | null;
          archived_at?: string | null;
          is_test?: boolean | null;
          contacts?: unknown;
        }
      | null
      | undefined;
    if (!p?.id) continue;
    if (String(p.patient_status ?? "") !== "active") continue;
    if (p.archived_at) continue;
    if (p.is_test === true) continue;
    const raw = p.contacts as
      | {
          full_name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
        }
      | Array<{
          full_name?: string | null;
          first_name?: string | null;
          last_name?: string | null;
        }>
      | null
      | undefined;
    const emb = Array.isArray(raw) ? raw[0] ?? null : raw ?? null;
    patients.push({
      patientId: String(p.id),
      label: displayNameFromContact(emb),
    });
  }

  patients.sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: "base" }));

  return NextResponse.json({ patients });
}
