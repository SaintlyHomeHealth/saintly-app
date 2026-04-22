import Link from "next/link";
import { redirect } from "next/navigation";

import { WorkspacePhonePageHeader } from "../_components/WorkspacePhonePageHeader";
import { VoicemailCard } from "@/app/workspace/phone/_components/VoicemailCard";
import { formatDurationSeconds } from "@/lib/crm/patient-hub-detail-display";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";
import { voicemailTranscriptionUiFromMeta, voiceAiShortSummaryFromMeta } from "@/lib/phone/voicemail-display";
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
  metadata: unknown;
};

function voicemailMetaSoftDeleteAt(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const v = (metadata as Record<string, unknown>).voicemail_inbox_soft_deleted_at;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

type PageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export default async function WorkspaceVoicemailPage(props: PageProps) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    redirect("/admin/phone");
  }
  const sp = (await props.searchParams) ?? {};
  const viewRaw = typeof sp.view === "string" ? sp.view.trim().toLowerCase() : "";
  const viewDeleted = viewRaw === "deleted";

  const hasFull = hasFullCallVisibility(staff);
  const supabase = await createServerSupabaseClient();

  let rows: VmCall[] = [];
  let error: { message: string } | null = null;

  if (hasFull) {
    const res = await supabase
      .from("phone_calls")
      .select(
        "id, created_at, started_at, direction, status, from_e164, to_e164, voicemail_duration_seconds, duration_seconds, contact_id, metadata, contacts ( full_name, first_name, last_name )"
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
            "id, created_at, started_at, direction, status, from_e164, to_e164, voicemail_duration_seconds, duration_seconds, contact_id, metadata, contacts ( full_name, first_name, last_name )"
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

  const callIds = calls.map((c) => c.id).filter(Boolean);
  /** One entry per call: if any voicemail message row is active (not soft-deleted), `deleted_at` is null. */
  const vmMsgByCallId: Record<string, { deleted_at: string | null }> = {};
  if (callIds.length > 0) {
    const { data: vmMsgs } = await supabase
      .from("messages")
      .select("phone_call_id, deleted_at")
      .eq("message_type", "voicemail")
      .in("phone_call_id", callIds);
    for (const m of vmMsgs ?? []) {
      const pid = typeof m.phone_call_id === "string" ? m.phone_call_id : "";
      if (!pid) continue;
      const delAt = typeof m.deleted_at === "string" ? m.deleted_at : null;
      const isActiveRow = delAt == null || String(delAt).trim() === "";
      const prev = vmMsgByCallId[pid];
      if (!prev) {
        vmMsgByCallId[pid] = { deleted_at: delAt };
      } else if (isActiveRow) {
        vmMsgByCallId[pid] = { deleted_at: null };
      }
    }
  }

  function removedFromListAt(c: VmCall): string | null {
    const row = vmMsgByCallId[c.id];
    const hasActiveVmMessage =
      row != null && (row.deleted_at == null || String(row.deleted_at).trim() === "");
    if (hasActiveVmMessage) {
      return null;
    }
    if (row?.deleted_at != null && String(row.deleted_at).trim() !== "") {
      return String(row.deleted_at);
    }
    return voicemailMetaSoftDeleteAt(c.metadata);
  }

  function isHiddenFromActiveList(c: VmCall): boolean {
    return removedFromListAt(c) != null;
  }

  const activeCalls = calls.filter((c) => !isHiddenFromActiveList(c));
  const deletedCallsRaw = calls.filter((c) => isHiddenFromActiveList(c));
  const deletedCalls = [...deletedCallsRaw].sort((a, b) => {
    const ta = removedFromListAt(a) ?? "";
    const tb = removedFromListAt(b) ?? "";
    return tb.localeCompare(ta);
  });

  const displayCalls = viewDeleted ? deletedCalls : activeCalls;

  const contactIds = [...new Set(calls.map((c) => c.contact_id).filter((x): x is string => Boolean(x)))];

  const threadByContact = new Map<string, string>();
  if (contactIds.length > 0) {
    const { data: convs } = await supabase
      .from("conversations")
      .select("id, primary_contact_id, last_message_at")
      .eq("channel", "sms")
      .is("deleted_at", null)
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

  const tabBase =
    "inline-flex min-h-9 flex-1 items-center justify-center rounded-xl border px-3 py-2 text-center text-[12px] font-semibold transition sm:flex-none sm:px-4 sm:text-sm";
  const tabActive = "border-sky-300 bg-phone-nav-active text-phone-navy ring-1 ring-inset ring-phone-border";
  const tabInactive = "border-sky-100/90 bg-white text-slate-600 hover:border-sky-200 hover:bg-phone-ice/60";

  return (
    <div className="ws-phone-page-shell flex flex-1 flex-col px-4 pb-6 pt-5 sm:px-5">
      <WorkspacePhonePageHeader
        title="Voicemail"
        subtitle={
          viewDeleted
            ? "Voicemails you removed from the main list (soft-deleted). Playback and details stay available until retention cleanup."
            : "Newest first — play messages, call back, or jump to the patient thread."
        }
      />

      <div className="mt-4 flex w-full gap-2 sm:mx-auto sm:max-w-md">
        <Link
          href="/workspace/phone/voicemail"
          className={`${tabBase} ${!viewDeleted ? tabActive : tabInactive}`}
          prefetch={false}
        >
          Active
        </Link>
        <Link
          href="/workspace/phone/voicemail?view=deleted"
          className={`${tabBase} ${viewDeleted ? tabActive : tabInactive}`}
          prefetch={false}
        >
          Deleted VM
        </Link>
      </div>

      {displayCalls.length === 0 ? (
        <div className="ws-phone-empty mt-4 p-10">
          {viewDeleted
            ? "No deleted voicemails here yet. Remove one from the Active tab to see it listed."
            : "You are all caught up. No voicemail to review."}
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {displayCalls.map((c) => {
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
            const vmTx = voicemailTranscriptionUiFromMeta(c.metadata);
            const aiRecap = voiceAiShortSummaryFromMeta(c.metadata);
            const removedAt = viewDeleted ? removedFromListAt(c) : null;
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
                transcript={vmTx.text}
                transcriptStatus={vmTx.status}
                transcriptError={vmTx.error}
                aiRecap={aiRecap}
                enableListDelete={!viewDeleted}
                removedFromListAt={viewDeleted ? removedAt : null}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}
