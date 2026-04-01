import { redirect } from "next/navigation";

import { VoicemailCard } from "@/app/workspace/phone/_components/VoicemailCard";
import { formatDurationSeconds } from "@/lib/crm/patient-hub-detail-display";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { canAccessWorkspacePhone, getStaffProfile, hasFullCallVisibility } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type ContactEmbed = { full_name?: unknown; first_name?: unknown; last_name?: unknown };

function contactName(raw: unknown): string | null {
  let emb: ContactEmbed | null = null;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) emb = raw as ContactEmbed;
  else if (Array.isArray(raw) && raw[0] && typeof raw[0] === "object") emb = raw[0] as ContactEmbed;
  const fn = emb && typeof emb.full_name === "string" ? emb.full_name.trim() : "";
  const f1 = emb && typeof emb.first_name === "string" ? emb.first_name : null;
  const f2 = emb && typeof emb.last_name === "string" ? emb.last_name : null;
  return fn || [f1, f2].filter(Boolean).join(" ").trim() || null;
}

function callbackNumber(direction: string | null, from: string | null, to: string | null): string | null {
  const dir = (direction ?? "").trim().toLowerCase();
  const inbound = (from ?? "").trim();
  const outbound = (to ?? "").trim();
  if (dir === "outbound") return outbound || null;
  return inbound || null;
}

type VmCall = {
  id: string;
  created_at: string;
  started_at: string | null;
  direction: string | null;
  status: string | null;
  from_e164: string | null;
  to_e164: string | null;
  voicemail_duration_seconds: number | null;
  duration_seconds: number | null;
  contact_id: string | null;
  contacts: unknown;
};

export default async function WorkspaceVoicemailPage() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }
  const hasFull = hasFullCallVisibility(staff);
  const supabase = await createServerSupabaseClient();

  let rows: VmCall[] = [];
  let error: { message: string } | null = null;

  if (hasFull) {
    const res = await supabase
      .from("phone_calls")
      .select(
        "id, created_at, started_at, direction, status, from_e164, to_e164, voicemail_duration_seconds, duration_seconds, contact_id, contacts ( full_name, first_name, last_name )"
      )
      .not("voicemail_recording_sid", "is", null)
      .order("started_at", { ascending: false, nullsFirst: false })
      .limit(60);
    rows = (res.data ?? []) as VmCall[];
    error = res.error;
  } else {
    const { data: assignedPatients, error: asnErr } = await supabase
      .from("patient_assignments")
      .select("patients ( contact_id )")
      .eq("assigned_user_id", staff.user_id)
      .eq("is_active", true);

    if (asnErr) {
      error = asnErr;
    } else {
      const contactIds = [
        ...new Set(
          (assignedPatients ?? [])
            .map((r) => {
              const pRaw = (r as { patients?: unknown }).patients;
              const p = pRaw && typeof pRaw === "object" && !Array.isArray(pRaw)
                ? (pRaw as { contact_id?: unknown })
                : null;
              return p && typeof p.contact_id === "string" ? p.contact_id : "";
            })
            .filter(Boolean)
        ),
      ];

      if (contactIds.length > 0) {
        const res = await supabase
          .from("phone_calls")
          .select(
            "id, created_at, started_at, direction, status, from_e164, to_e164, voicemail_duration_seconds, duration_seconds, contact_id, contacts ( full_name, first_name, last_name )"
          )
          .not("voicemail_recording_sid", "is", null)
          .in("contact_id", contactIds)
          .order("started_at", { ascending: false, nullsFirst: false })
          .limit(60);
        rows = (res.data ?? []) as VmCall[];
        error = res.error;
      }
    }
  }

  if (error) {
    console.warn("[workspace/phone/voicemail] list:", error.message);
  }

  const calls = rows;
  const contactIds = [...new Set(calls.map((c) => c.contact_id).filter((x): x is string => Boolean(x)))];

  const threadByContact = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, primary_contact_id, last_message_at")
      .eq("channel", "sms")
      .in("primary_contact_id", contactIds)
      .order("last_message_at", { ascending: false, nullsFirst: false });
    for (const c of convs ?? []) {
      const cid = typeof c.primary_contact_id === "string" ? c.primary_contact_id : "";
      if (!cid || threadByContact.has(cid)) continue;
      threadByContact.set(cid, String(c.id));
    }
  }

  const patientByContact = new Map<string, string>();
  if (contactIds.length > 0) {
    if (hasFull) {
      const { data: prows } = await supabase
        .from("patients")
        .select("id, contact_id")
        .in("contact_id", contactIds);
      for (const p of prows ?? []) {
        const cid = typeof p.contact_id === "string" ? p.contact_id : "";
        if (!cid || patientByContact.has(cid)) continue;
        patientByContact.set(cid, String(p.id));
      }
    } else {
      const { data: asnRows } = await supabase
        .from("patient_assignments")
        .select("patient_id, patients ( id, contact_id )")
        .eq("assigned_user_id", staff.user_id)
        .eq("is_active", true);
      for (const a of asnRows ?? []) {
        const pRaw = (a as { patients?: unknown }).patients;
        const p = pRaw && typeof pRaw === "object" && !Array.isArray(pRaw) ? (pRaw as { id?: unknown; contact_id?: unknown }) : null;
        const pid = p && typeof p.id === "string" ? p.id : "";
        const cid = p && typeof p.contact_id === "string" ? p.contact_id : "";
        if (!pid || !cid || patientByContact.has(cid) || !contactIds.includes(cid)) continue;
        patientByContact.set(cid, pid);
      }
    }
  }

  return (
    <div className="flex flex-1 flex-col px-4 pb-4 pt-4">
      <h1 className="text-xl font-semibold tracking-tight text-slate-900">Voicemail</h1>
      <p className="mt-0.5 text-xs text-slate-500">Newest first. Play, call back, and text from here.</p>

      {calls.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          No voicemail yet.
        </div>
      ) : (
        <ul className="mt-4 space-y-2">
          {calls.map((c) => {
            const when = typeof c.started_at === "string" ? c.started_at : c.created_at;
            const vmSec =
              typeof c.voicemail_duration_seconds === "number" && Number.isFinite(c.voicemail_duration_seconds)
                ? c.voicemail_duration_seconds
                : typeof c.duration_seconds === "number"
                  ? c.duration_seconds
                  : null;
            const cid = typeof c.contact_id === "string" ? c.contact_id : "";
            const number = callbackNumber(c.direction, c.from_e164, c.to_e164);
            const display = contactName(c.contacts) ?? number ?? "Unknown caller";
            const convId = cid ? threadByContact.get(cid) ?? null : null;
            const patientId = cid ? patientByContact.get(cid) ?? null : null;
            return (
              <VoicemailCard
                key={c.id}
                callId={c.id}
                title={display}
                subtitle={number ?? "Unknown number"}
                whenLabel={formatAdminPhoneWhen(when)}
                durationLabel={formatDurationSeconds(vmSec)}
                callbackPhone={number}
                threadHref={convId ? `/workspace/phone/inbox/${convId}` : null}
                patientHref={patientId ? `/workspace/phone/patients/${patientId}` : null}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
