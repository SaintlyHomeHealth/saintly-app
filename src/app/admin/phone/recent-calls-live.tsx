"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";

import {
  assignPhoneCall,
  claimPhoneCall,
  convertLeadToPatient,
  createContactFromPhoneCall,
  createLeadFromContact,
  createPhoneCallNote,
  createPhoneCallTask,
  unassignPhoneCall,
  updateContactFullName,
  updatePhoneCallNotification,
  updatePhoneCallPrimaryTag,
} from "./actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { formatAdminPhoneWhen } from "@/lib/phone/format-admin-when";

/** Per-contact CRM pipeline for Recent calls (server-built + client-merged). */
export type ContactPipelineState = {
  activeLeadId: string | null;
  patientStatus: string | null;
};

export type PhoneCallRow = {
  id: string;
  created_at: string;
  updated_at: string;
  external_call_id: string;
  direction: string;
  from_e164: string | null;
  to_e164: string | null;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  voicemail_recording_sid: string | null;
  voicemail_duration_seconds: number | null;
  priority_sms_sent_at: string | null;
  priority_sms_reason: string | null;
  auto_reply_sms_sent_at: string | null;
  auto_reply_sms_body: string | null;
  assigned_to_user_id: string | null;
  assigned_at: string | null;
  assigned_to_label: string | null;
  primary_tag: string | null;
  contact_id: string | null;
  crm_contact_display_name: string | null;
  /** JSON from `phone_calls.metadata` (e.g. `crm` classification). */
  metadata: Record<string, unknown> | null;
};

type OwnershipOptimisticPatch = Pick<
  PhoneCallRow,
  "assigned_to_user_id" | "assigned_to_label" | "assigned_at"
>;

function applyOwnershipOverlay(
  row: PhoneCallRow,
  optimistic: Record<string, OwnershipOptimisticPatch>
): PhoneCallRow {
  const o = optimistic[row.id];
  if (!o) return row;
  return { ...row, ...o };
}

/** True when server row matches optimistic ownership (by assignee id; avoids pre-refresh flicker). */
function ownershipPatchMatchesServer(patch: OwnershipOptimisticPatch, row: PhoneCallRow): boolean {
  if (patch.assigned_to_user_id === null) {
    return row.assigned_to_user_id === null;
  }
  return row.assigned_to_user_id === patch.assigned_to_user_id;
}

export type PhoneNotificationRow = {
  id: string;
  phone_call_id: string;
  type: string;
  status: string;
  created_at: string;
  acknowledged_at: string | null;
  last_sms_attempt_at: string | null;
  last_sms_error: string | null;
};

export type PhoneCallTaskSnippet = {
  id: string;
  title: string;
  status: string;
};

function priorityReasonLabel(code: string) {
  const s = code.trim();
  switch (s) {
    case "voicemail_left":
      return "Voicemail";
    case "repeat_caller_15m":
      return "Repeat caller (15m)";
    case "missed_long_call":
      return "Long ring";
    default:
      return s || "Priority";
  }
}

function followUpPill(status: string) {
  const s = status.trim();
  const base = "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold";
  switch (s) {
    case "new":
      return `${base} border border-amber-200 bg-amber-50 text-amber-900`;
    case "acknowledged":
      return `${base} border border-sky-200 bg-sky-50 text-sky-900`;
    case "resolved":
      return `${base} border border-slate-200 bg-slate-50 text-slate-600`;
    default:
      return `${base} border border-slate-200 bg-slate-50 text-slate-700`;
  }
}

function statusPill(status: string) {
  const s = status.trim();
  const base = "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold";
  switch (s) {
    case "completed":
      return `${base} border border-green-200 bg-green-50 text-green-800`;
    case "in_progress":
    case "ringing":
    case "initiated":
      return `${base} border border-sky-200 bg-sky-50 text-sky-800`;
    case "missed":
      // More prominent missed-call styling (treated as a lead).
      return `${base} border border-red-400 bg-red-100 text-red-950`;
    case "failed":
    case "cancelled":
      return `${base} border border-red-200 bg-red-50 text-red-800`;
    case "abandoned":
      return `${base} border border-orange-200 bg-orange-50 text-orange-900`;
    default:
      return `${base} border border-slate-200 bg-slate-50 text-slate-700`;
  }
}

const NEUTRAL_ROW_CLASS = "border-b border-slate-100 last:border-0";

/** Matches server triage / `isMissedStatus` on `/admin/phone` (case-insensitive). */
function isMissedCallStatus(status: string): boolean {
  return status.trim().toLowerCase() === "missed";
}

/** Same server action + fields as the Assignment panel; submit wired for optimistic UI in RecentCallsLive. */
function ClaimPhoneCallForm({
  callId,
  buttonClassName,
  disabled,
  onSubmit,
}: {
  callId: string;
  buttonClassName: string;
  disabled?: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="callId" value={callId} />
      <button type="submit" disabled={disabled} className={buttonClassName}>
        Claim
      </button>
    </form>
  );
}

function UnassignPhoneCallForm({
  callId,
  buttonClassName,
  disabled,
  onSubmit,
}: {
  callId: string;
  buttonClassName: string;
  disabled?: boolean;
  onSubmit: (e: FormEvent<HTMLFormElement>) => void | Promise<void>;
}) {
  return (
    <form onSubmit={onSubmit}>
      <input type="hidden" name="callId" value={callId} />
      <button type="submit" disabled={disabled} className={buttonClassName}>
        Unassign
      </button>
    </form>
  );
}

const CLAIM_ASSIGNMENT_PANEL_BUTTON_CLASS =
  "rounded-md border border-sky-300 bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-900 hover:bg-sky-100";

const UNASSIGN_ASSIGNMENT_PANEL_BUTTON_CLASS =
  "rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50";

const CLAIM_TRIAGE_QUICK_BUTTON_CLASS =
  "rounded border border-sky-500 bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-950 shadow-sm hover:bg-sky-200";

const UNASSIGN_TRIAGE_QUICK_BUTTON_CLASS =
  "rounded border border-slate-400 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-800 shadow-sm hover:bg-slate-50";

function sortCallNewestFirst(a: PhoneCallRow, b: PhoneCallRow) {
  const ta = new Date(a.started_at ?? a.created_at).getTime();
  const tb = new Date(b.started_at ?? b.created_at).getTime();
  return tb - ta;
}

function rowMatchesCallVisibility(
  row: PhoneCallRow,
  callVisibility: "full" | "nurse",
  currentUserId: string
): boolean {
  if (callVisibility === "full") return true;
  const a = row.assigned_to_user_id;
  return a === null || a === currentUserId;
}

function cloneNotifMap(m: Record<string, PhoneNotificationRow[]>): Record<string, PhoneNotificationRow[]> {
  return Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v.map((n) => ({ ...n }))]));
}

function formatCrmContactDisplay(
  c: { full_name: string | null; first_name: string | null; last_name: string | null } | null
): string | null {
  if (!c) return null;
  const fn = (c.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return parts || null;
}

async function fetchCrmContactDisplayName(contactId: string): Promise<string | null> {
  const supabase = createBrowserSupabaseClient();
  const { data, error } = await supabase
    .from("contacts")
    .select("full_name, first_name, last_name")
    .eq("id", contactId)
    .maybeSingle();
  if (error) {
    console.warn("[admin/phone] CRM contact label:", error.message);
    return null;
  }
  if (!data) return null;
  return formatCrmContactDisplay({
    full_name: typeof data.full_name === "string" ? data.full_name : null,
    first_name: typeof data.first_name === "string" ? data.first_name : null,
    last_name: typeof data.last_name === "string" ? data.last_name : null,
  });
}

function mergeServerCallsSnapshot(
  server: PhoneCallRow[],
  client: PhoneCallRow[],
  maxVisible: number
): PhoneCallRow[] {
  const byId = new Map<string, PhoneCallRow>();
  for (const r of server) byId.set(r.id, r);
  for (const r of client) {
    if (!byId.has(r.id)) byId.set(r.id, r);
  }
  return Array.from(byId.values()).sort(sortCallNewestFirst).slice(0, maxVisible);
}

function mergeContactPipelineSnapshot(
  server: Record<string, ContactPipelineState>,
  client: Record<string, ContactPipelineState>
): Record<string, ContactPipelineState> {
  return { ...client, ...server };
}

function normalizeRealtimePhoneCall(v: unknown): PhoneCallRow | null {
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  if (
    typeof o.id !== "string" ||
    typeof o.created_at !== "string" ||
    typeof o.external_call_id !== "string" ||
    typeof o.direction !== "string" ||
    typeof o.status !== "string"
  ) {
    return null;
  }
  const dur = o.duration_seconds;
  let durNum: number | null = null;
  if (typeof dur === "number" && Number.isFinite(dur)) durNum = Math.round(dur);
  else if (typeof dur === "string" && dur.trim() !== "") {
    const n = Number.parseInt(dur, 10);
    if (Number.isFinite(n)) durNum = n;
  }
  const vmDur = o.voicemail_duration_seconds;
  let vmDurNum: number | null = null;
  if (typeof vmDur === "number" && Number.isFinite(vmDur)) vmDurNum = Math.round(vmDur);
  else if (typeof vmDur === "string" && vmDur.trim() !== "") {
    const n = Number.parseInt(vmDur, 10);
    if (Number.isFinite(n)) vmDurNum = n;
  }
  const prAt = o.priority_sms_sent_at;
  const prReason = o.priority_sms_reason;
  const arAt = o.auto_reply_sms_sent_at;
  const arBody = o.auto_reply_sms_body;
  const asUid = o.assigned_to_user_id;
  const asAt = o.assigned_at;
  const asLabel = o.assigned_to_label;
  const pTag = o.primary_tag;
  const cId = o.contact_id;
  const metaRaw = o.metadata;
  const metadata =
    metaRaw && typeof metaRaw === "object" && !Array.isArray(metaRaw)
      ? (metaRaw as Record<string, unknown>)
      : null;
  return {
    id: o.id,
    created_at: o.created_at,
    updated_at: typeof o.updated_at === "string" ? o.updated_at : o.created_at,
    external_call_id: o.external_call_id,
    direction: o.direction,
    from_e164: typeof o.from_e164 === "string" ? o.from_e164 : null,
    to_e164: typeof o.to_e164 === "string" ? o.to_e164 : null,
    status: o.status,
    started_at: typeof o.started_at === "string" ? o.started_at : null,
    ended_at: typeof o.ended_at === "string" ? o.ended_at : null,
    duration_seconds: durNum,
    voicemail_recording_sid: typeof o.voicemail_recording_sid === "string" ? o.voicemail_recording_sid : null,
    voicemail_duration_seconds: vmDurNum,
    priority_sms_sent_at: typeof prAt === "string" ? prAt : null,
    priority_sms_reason: typeof prReason === "string" ? prReason : null,
    auto_reply_sms_sent_at: typeof arAt === "string" ? arAt : null,
    auto_reply_sms_body: typeof arBody === "string" ? arBody : null,
    assigned_to_user_id: typeof asUid === "string" ? asUid : null,
    assigned_at: typeof asAt === "string" ? asAt : null,
    assigned_to_label: typeof asLabel === "string" ? asLabel : null,
    primary_tag: typeof pTag === "string" ? pTag : null,
    contact_id: typeof cId === "string" ? cId : null,
    crm_contact_display_name: null,
    metadata,
  };
}

type Props = {
  initialCalls: PhoneCallRow[];
  initialNotifByCallId: Record<string, PhoneNotificationRow[]>;
  initialContactPipeline: Record<string, ContactPipelineState>;
  taskCountByCallId?: Record<string, number>;
  taskSnippetsByCallId?: Record<string, PhoneCallTaskSnippet[]>;
  /** Max rows to keep rendered (also caps realtime merges). Defaults to 100. */
  maxVisible?: number;
  /** Optional section title override. */
  sectionTitle?: string;
  /** Optional section subtitle override. */
  sectionSubtitle?: string;
  /** Adds stronger urgency styling for triage usage. */
  emphasizeUrgency?: boolean;
  /** Show compact “why in triage” badges (Needs Attention only; presentation-only). */
  triageReasonBadges?: boolean;
  /** Stronger Assigned column: “Assigned to …” / emphasized Unassigned (Needs Attention only). */
  emphasizeAssignmentVisibility?: boolean;
  /** Quick Claim / Unassign next to Call back + hint under More actions (Needs Attention only). */
  triageOwnershipQuickActions?: boolean;
  /** Admin / super_admin: show Unassign. Managers (when page opens to them) can claim but not unassign. */
  allowUnassign?: boolean;
  /** Server applies the same filter; client realtime must mirror it for nurses. */
  callVisibility?: "full" | "nurse";
  currentUserId?: string;
  /** Manager/admin: assign calls to staff logins. */
  assignableStaff?: { user_id: string; label: string }[];
};

export function RecentCallsLive({
  initialCalls,
  initialNotifByCallId,
  initialContactPipeline,
  taskCountByCallId = {},
  taskSnippetsByCallId = {},
  allowUnassign = false,
  callVisibility = "full",
  currentUserId = "",
  assignableStaff = [],
  maxVisible = 100,
  sectionTitle,
  sectionSubtitle,
  emphasizeUrgency = false,
  triageReasonBadges = false,
  emphasizeAssignmentVisibility = false,
  triageOwnershipQuickActions = false,
}: Props) {
  const [calls, setCalls] = useState<PhoneCallRow[]>(() => initialCalls.slice(0, maxVisible));
  const [contactPipeline, setContactPipeline] = useState<Record<string, ContactPipelineState>>(
    () => initialContactPipeline
  );
  const [notifByCallId, setNotifByCallId] = useState<Record<string, PhoneNotificationRow[]>>(() =>
    cloneNotifMap(initialNotifByCallId)
  );
  const [creatingContactCallId, setCreatingContactCallId] = useState<string | null>(null);
  const [contactNameDrafts, setContactNameDrafts] = useState<Record<string, string>>({});
  const [savingContactNameCallId, setSavingContactNameCallId] = useState<string | null>(null);
  const [creatingLeadCallId, setCreatingLeadCallId] = useState<string | null>(null);
  const [convertingLeadId, setConvertingLeadId] = useState<string | null>(null);
  const [noteOpenCallId, setNoteOpenCallId] = useState<string | null>(null);
  const [noteDraftByCallId, setNoteDraftByCallId] = useState<Record<string, string>>({});
  const [savingNoteCallId, setSavingNoteCallId] = useState<string | null>(null);
  const [expandedCallId, setExpandedCallId] = useState<string | null>(null);
  const [ownershipOptimisticByCallId, setOwnershipOptimisticByCallId] = useState<
    Record<string, OwnershipOptimisticPatch>
  >({});
  const [ownershipPendingByCallId, setOwnershipPendingByCallId] = useState<Record<string, boolean>>(
    {}
  );
  const ownershipPendingCallIdsRef = useRef(new Set<string>());

  const router = useRouter();

  const currentUserClaimLabel = useMemo(() => {
    const hit = assignableStaff.find((s) => s.user_id === currentUserId);
    if (hit?.label?.trim()) return hit.label.trim();
    if (currentUserId) return `User ${currentUserId.slice(0, 8)}…`;
    return "";
  }, [assignableStaff, currentUserId]);

  function clearOwnershipOptimistic(callId: string) {
    setOwnershipOptimisticByCallId((prev) => {
      const next = { ...prev };
      delete next[callId];
      return next;
    });
  }

  async function handleOwnershipClaim(e: FormEvent<HTMLFormElement>, callId: string) {
    e.preventDefault();
    if (!currentUserId || ownershipPendingCallIdsRef.current.has(callId)) return;
    ownershipPendingCallIdsRef.current.add(callId);
    setOwnershipPendingByCallId((p) => ({ ...p, [callId]: true }));
    const fd = new FormData(e.currentTarget);
    const now = new Date().toISOString();
    setOwnershipOptimisticByCallId((p) => ({
      ...p,
      [callId]: {
        assigned_to_user_id: currentUserId,
        assigned_to_label: currentUserClaimLabel || `User ${currentUserId.slice(0, 8)}…`,
        assigned_at: now,
      },
    }));
    try {
      const result = await claimPhoneCall(fd);
      if (!result.ok) {
        clearOwnershipOptimistic(callId);
      } else {
        await router.refresh();
      }
    } catch {
      clearOwnershipOptimistic(callId);
    } finally {
      ownershipPendingCallIdsRef.current.delete(callId);
      setOwnershipPendingByCallId((p) => {
        const n = { ...p };
        delete n[callId];
        return n;
      });
    }
  }

  async function handleOwnershipUnassign(e: FormEvent<HTMLFormElement>, callId: string) {
    e.preventDefault();
    if (ownershipPendingCallIdsRef.current.has(callId)) return;
    ownershipPendingCallIdsRef.current.add(callId);
    setOwnershipPendingByCallId((p) => ({ ...p, [callId]: true }));
    const fd = new FormData(e.currentTarget);
    setOwnershipOptimisticByCallId((p) => ({
      ...p,
      [callId]: {
        assigned_to_user_id: null,
        assigned_to_label: null,
        assigned_at: null,
      },
    }));
    try {
      const result = await unassignPhoneCall(fd);
      if (!result.ok) {
        clearOwnershipOptimistic(callId);
      } else {
        await router.refresh();
      }
    } catch {
      clearOwnershipOptimistic(callId);
    } finally {
      ownershipPendingCallIdsRef.current.delete(callId);
      setOwnershipPendingByCallId((p) => {
        const n = { ...p };
        delete n[callId];
        return n;
      });
    }
  }

  async function handleOwnershipAssign(e: FormEvent<HTMLFormElement>, callId: string) {
    e.preventDefault();
    if (ownershipPendingCallIdsRef.current.has(callId)) return;
    const fd = new FormData(e.currentTarget);
    const assignToUserIdRaw = fd.get("assignToUserId");
    const assignToUserId = typeof assignToUserIdRaw === "string" ? assignToUserIdRaw.trim() : "";
    if (!assignToUserId) return;
    const label =
      assignableStaff.find((s) => s.user_id === assignToUserId)?.label?.trim() ||
      `User ${assignToUserId.slice(0, 8)}…`;
    const now = new Date().toISOString();
    ownershipPendingCallIdsRef.current.add(callId);
    setOwnershipPendingByCallId((p) => ({ ...p, [callId]: true }));
    setOwnershipOptimisticByCallId((p) => ({
      ...p,
      [callId]: {
        assigned_to_user_id: assignToUserId,
        assigned_to_label: label,
        assigned_at: now,
      },
    }));
    try {
      const result = await assignPhoneCall(fd);
      if (!result.ok) {
        clearOwnershipOptimistic(callId);
      } else {
        await router.refresh();
      }
    } catch {
      clearOwnershipOptimistic(callId);
    } finally {
      ownershipPendingCallIdsRef.current.delete(callId);
      setOwnershipPendingByCallId((p) => {
        const n = { ...p };
        delete n[callId];
        return n;
      });
    }
  }

  const initialCallsRef = useRef(initialCalls);
  initialCallsRef.current = initialCalls;
  const initialNotifRef = useRef(initialNotifByCallId);
  initialNotifRef.current = initialNotifByCallId;
  const initialContactPipelineRef = useRef(initialContactPipeline);
  initialContactPipelineRef.current = initialContactPipeline;

  const serverSnapshotKey = useMemo(
    () =>
      JSON.stringify({
        c: initialCalls.map((r) => [
          r.id,
          r.status,
          r.updated_at,
          r.duration_seconds,
          r.voicemail_recording_sid,
          r.started_at,
          r.created_at,
          r.priority_sms_sent_at,
          r.priority_sms_reason,
          r.auto_reply_sms_sent_at,
          r.assigned_to_user_id,
          r.assigned_to_label,
          r.primary_tag,
          r.contact_id,
          r.crm_contact_display_name,
          JSON.stringify(r.metadata ?? null),
        ]),
        p: Object.keys(initialContactPipeline)
          .sort()
          .map((k) => {
            const x = initialContactPipeline[k];
            return [k, x?.activeLeadId ?? null, x?.patientStatus ?? null];
          }),
        n: Object.keys(initialNotifByCallId)
          .sort()
          .map((k) => [
            k,
            (initialNotifByCallId[k] ?? []).map((x) => [
              x.id,
              x.status,
              x.last_sms_attempt_at,
              x.last_sms_error,
            ]),
          ]),
        t: initialCalls.map((r) => [r.id, taskCountByCallId[r.id] ?? 0]),
        s: initialCalls.map((r) => [
          r.id,
          (taskSnippetsByCallId[r.id] ?? []).map((x) => [x.id, x.title, x.status]),
        ]),
      }),
    [initialCalls, initialContactPipeline, initialNotifByCallId, taskCountByCallId, taskSnippetsByCallId]
  );

  useEffect(() => {
    setCalls((prev) => mergeServerCallsSnapshot(initialCallsRef.current, prev, maxVisible));
    setNotifByCallId(cloneNotifMap(initialNotifRef.current));
    setContactPipeline((prev) =>
      mergeContactPipelineSnapshot(initialContactPipelineRef.current, prev)
    );
  }, [serverSnapshotKey, maxVisible]);

  useEffect(() => {
    setOwnershipOptimisticByCallId((prev) => {
      const ids = Object.keys(prev);
      if (ids.length === 0) return prev;
      const next = { ...prev };
      let changed = false;
      for (const callId of ids) {
        const patch = prev[callId];
        const serverRow = initialCalls.find((r) => r.id === callId);
        if (serverRow && ownershipPatchMatchesServer(patch, serverRow)) {
          delete next[callId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [initialCalls]);

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    const channel = supabase
      .channel("phone_calls_admin_recent")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "phone_calls" },
        (payload) => {
          const ev = payload.eventType;
          if (ev === "INSERT") {
            const row = normalizeRealtimePhoneCall(payload.new);
            if (!row) return;
            if (!rowMatchesCallVisibility(row, callVisibility, currentUserId)) return;
            setCalls((prev) => {
              const deduped = prev.filter((x) => x.id !== row.id);
              const sorted = [row, ...deduped].sort(sortCallNewestFirst).slice(0, maxVisible);
              if (row.contact_id) {
                void fetchCrmContactDisplayName(row.contact_id).then((name) => {
                  if (!name) return;
                  setCalls((p) =>
                    p.map((r) =>
                      r.id === row.id && r.contact_id === row.contact_id ? { ...r, crm_contact_display_name: name } : r
                    )
                  );
                });
              }
              return sorted;
            });
            return;
          }
          if (ev === "UPDATE") {
            const row = normalizeRealtimePhoneCall(payload.new);
            if (!row) return;
            const visible = rowMatchesCallVisibility(row, callVisibility, currentUserId);
            setCalls((prev) => {
              const idx = prev.findIndex((a) => a.id === row.id);
              if (!visible) {
                if (idx === -1) return prev;
                return prev.filter((a) => a.id !== row.id);
              }
              if (idx === -1) {
                const deduped = prev.filter((x) => x.id !== row.id);
                const sorted = [...deduped, row].sort(sortCallNewestFirst).slice(0, maxVisible);
                if (row.contact_id) {
                  void fetchCrmContactDisplayName(row.contact_id).then((name) => {
                    if (!name) return;
                    setCalls((p) =>
                      p.map((r) =>
                        r.id === row.id && r.contact_id === row.contact_id ? { ...r, crm_contact_display_name: name } : r
                      )
                    );
                  });
                }
                return sorted;
              }
              const prevRow = prev[idx];
              let crmName: string | null = null;
              if (row.contact_id && prevRow.contact_id === row.contact_id) {
                crmName = prevRow.crm_contact_display_name ?? null;
              }
              const merged: PhoneCallRow = { ...row, crm_contact_display_name: crmName };
              const next = [...prev];
              next[idx] = merged;
              const sorted = next.sort(sortCallNewestFirst).slice(0, maxVisible);
              if (merged.contact_id && !merged.crm_contact_display_name) {
                void fetchCrmContactDisplayName(merged.contact_id).then((name) => {
                  if (!name) return;
                  setCalls((p) =>
                    p.map((r) =>
                      r.id === merged.id && r.contact_id === merged.contact_id ? { ...r, crm_contact_display_name: name } : r
                    )
                  );
                });
              }
              return sorted;
            });
            return;
          }
          if (ev === "DELETE") {
            const id = (payload.old as { id?: string })?.id;
            if (typeof id !== "string") return;
            setCalls((prev) => prev.filter((a) => a.id !== id));
            setNotifByCallId((prev) => {
              const { [id]: _, ...rest } = prev;
              return rest;
            });
          }
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [callVisibility, currentUserId, maxVisible]);

  function handleCreateContactFromCall(row: PhoneCallRow) {
    if (!row.from_e164?.trim() || row.contact_id) return;
    setCreatingContactCallId(row.id);
    void createContactFromPhoneCall(row.id).then((res) => {
      setCreatingContactCallId(null);
      if (!res.ok) return;
      setCalls((p) =>
        p.map((r) =>
          r.id === row.id
            ? {
                ...r,
                contact_id: res.contactId,
                crm_contact_display_name: res.crm_contact_display_name,
              }
            : r
        )
      );
      setContactPipeline((prev) => ({
        ...prev,
        [res.contactId]: { activeLeadId: null, patientStatus: null },
      }));
    });
  }

  function contactNameInputValue(row: PhoneCallRow): string {
    const d = contactNameDrafts[row.id];
    if (d !== undefined) return d;
    return row.crm_contact_display_name?.trim() || "";
  }

  function handleSaveContactName(row: PhoneCallRow) {
    if (!row.contact_id) return;
    const name = contactNameInputValue(row).trim();
    if (!name) return;
    setSavingContactNameCallId(row.id);
    const fd = new FormData();
    fd.set("contactId", row.contact_id);
    fd.set("fullName", name);
    void updateContactFullName(fd).then((res) => {
      setSavingContactNameCallId(null);
      if (!res.ok) return;
      setContactNameDrafts((prev) => {
        const next = { ...prev };
        delete next[row.id];
        return next;
      });
      setCalls((p) =>
        p.map((r) => (r.id === row.id ? { ...r, crm_contact_display_name: name } : r))
      );
    });
  }

  function handleCreateLead(row: PhoneCallRow) {
    const cid = row.contact_id;
    if (!cid) return;
    setCreatingLeadCallId(row.id);
    void createLeadFromContact(cid).then((res) => {
      setCreatingLeadCallId(null);
      if (!res.ok) return;
      setContactPipeline((prev) => ({
        ...prev,
        [cid]: {
          activeLeadId: res.leadId,
          patientStatus: prev[cid]?.patientStatus ?? null,
        },
      }));
    });
  }

  function handleConvertLead(row: PhoneCallRow) {
    const cid = row.contact_id;
    if (!cid) return;
    const lid = contactPipeline[cid]?.activeLeadId;
    if (!lid) return;
    setConvertingLeadId(lid);
    void convertLeadToPatient(lid).then((res) => {
      setConvertingLeadId(null);
      if (!res.ok) return;
      setContactPipeline((prev) => ({
        ...prev,
        [cid]: { activeLeadId: null, patientStatus: "active" },
      }));
    });
  }

  function otherPartyE164(row: PhoneCallRow): string | null {
    const dir = (row.direction ?? "").trim().toLowerCase();
    const e164 = dir === "inbound" ? row.from_e164 : row.to_e164;
    return typeof e164 === "string" && e164.trim() ? e164.trim() : null;
  }

  function handleCallBack(row: PhoneCallRow) {
    const to = otherPartyE164(row);
    if (!to) return;
    window.dispatchEvent(
      new CustomEvent("softphone:dialTo", {
        detail: { to },
      })
    );
  }

  async function handleSendSmsLink(row: PhoneCallRow) {
    const to = otherPartyE164(row);
    if (!to) return;

    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase
      .from("conversations")
      .select("id, assigned_to_user_id")
      .eq("channel", "sms")
      .eq("main_phone_e164", to)
      .maybeSingle();

    if (error) {
      console.warn("[admin/phone] send sms lookup:", error.message);
      return;
    }

    const convId = data?.id;
    if (!convId || typeof convId !== "string") return;

    if (callVisibility === "nurse") {
      const assigned =
        typeof data?.assigned_to_user_id === "string" ? data?.assigned_to_user_id : null;
      if (assigned && assigned !== currentUserId) return;
    }

    router.push(`/admin/phone/messages/${convId}`);
  }

  async function handleSaveNote(row: PhoneCallRow) {
    if (!noteOpenCallId || noteOpenCallId !== row.id) return;
    const body = (noteDraftByCallId[row.id] ?? "").trim();
    if (!body) return;

    setSavingNoteCallId(row.id);
    const fd = new FormData();
    fd.set("phoneCallId", row.id);
    fd.set("body", body);
    await createPhoneCallNote(fd);
    setSavingNoteCallId(null);

    setNoteOpenCallId(null);
    setNoteDraftByCallId((prev) => {
      const next = { ...prev };
      delete next[row.id];
      return next;
    });
  }

  function handleQuickIntakeMissedCall(row: PhoneCallRow, crmPipe: ContactPipelineState | null) {
    const missed = row.status.trim() === "missed";
    if (!missed) return;

    if (row.contact_id) {
      // Missed call treated as a lead: create the lead if needed.
      if (crmPipe?.patientStatus) return;
      if (crmPipe?.activeLeadId) return;
      handleCreateLead(row);
      return;
    }

    // No contact linked yet: create contact, then immediately create the lead.
    if (!row.from_e164) return;
    setCreatingContactCallId(row.id);
    void createContactFromPhoneCall(row.id).then((res) => {
      setCreatingContactCallId(null);
      if (!res.ok) return;

      setCalls((p) =>
        p.map((r) =>
          r.id === row.id ? { ...r, contact_id: res.contactId, crm_contact_display_name: res.crm_contact_display_name } : r
        )
      );

      setContactPipeline((prev) => ({
        ...prev,
        [res.contactId]: {
          activeLeadId: null,
          patientStatus: null,
        },
      }));

      setCreatingLeadCallId(row.id);
      void createLeadFromContact(res.contactId).then(async (leadRes) => {
        setCreatingLeadCallId(null);
        if (leadRes.ok) {
          setContactPipeline((prev) => ({
            ...prev,
            [res.contactId]: {
              activeLeadId: leadRes.leadId,
              patientStatus: prev[res.contactId]?.patientStatus ?? null,
            },
          }));
          return;
        }

        // If lead creation failed due to an already-existing active lead, best-effort recover it.
        // (This keeps the “missed call treated as lead” workflow accurate without a full reload.)
        const supabase = createBrowserSupabaseClient();
        const { data: leadRows } = await supabase
          .from("leads")
          .select("id,status")
          .eq("contact_id", res.contactId)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(5);

        const rows = (leadRows ?? []) as Array<{ id: unknown; status: unknown }>;
        const active = rows.find((L) => String(L?.status ?? "").trim() !== "converted");
        const activeId = active?.id != null ? String(active.id) : "";
        if (!activeId) return;

        setContactPipeline((prev) => ({
          ...prev,
          [res.contactId]: {
            activeLeadId: activeId,
            patientStatus: prev[res.contactId]?.patientStatus ?? null,
          },
        }));
      });
    });
  }

  return (
    <div
      className={`overflow-hidden rounded-[28px] border bg-white shadow-sm ${
        emphasizeUrgency ? "border-amber-300" : "border-slate-200"
      }`}
    >
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-lg font-semibold text-slate-900">{sectionTitle ?? "Recent calls"}</h2>
        <p className="mt-1 text-xs text-slate-500">
          {sectionSubtitle ??
            (callVisibility === "full"
              ? `Full call log · newest ${maxVisible}`
              : `Your assigned calls & shared unassigned queue · newest ${maxVisible}`)}
        </p>
      </div>
      {calls.length === 0 ? (
        <p className="px-6 py-8 text-sm text-slate-500">
          No calls logged yet. Place a test call to your Twilio number after applying migrations.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-xs font-semibold text-slate-600">
                <th className="px-4 py-3">Call</th>
                <th className="whitespace-nowrap px-4 py-3">Status</th>
                <th className="whitespace-nowrap px-4 py-3">Time</th>
                <th className="whitespace-nowrap px-4 py-3">Assigned</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((rawRow) => {
                const row = applyOwnershipOverlay(rawRow, ownershipOptimisticByCallId);
                const alerts = notifByCallId[row.id] ?? [];
                const hasFollowUpHeader =
                  Boolean(row.priority_sms_reason) || Boolean(row.auto_reply_sms_sent_at);
                const st = row.status.trim();
                const missed = isMissedCallStatus(row.status);
                const timeLabel = formatAdminPhoneWhen(row.started_at ?? row.created_at);
                const durationLabel = row.duration_seconds != null ? `${row.duration_seconds}s` : "—";
                const nameOrNumber = row.crm_contact_display_name?.trim()
                  ? row.crm_contact_display_name
                  : row.from_e164?.trim()
                    ? row.from_e164
                    : row.to_e164?.trim()
                      ? row.to_e164
                      : "—";
                const phoneLabel = row.from_e164?.trim() ? row.from_e164 : "—";
                const assignedLabel = row.assigned_to_user_id
                  ? row.assigned_to_label?.trim() || row.assigned_to_user_id.slice(0, 8) + "…"
                  : "Unassigned";
                const unassigned = !row.assigned_to_user_id;
                const noContact = !row.contact_id;
                const trClass = NEUTRAL_ROW_CLASS;
                const statusPillClass = statusPill(st);
                const crmPipe = row.contact_id
                  ? (contactPipeline[row.contact_id] ?? {
                      activeLeadId: null,
                      patientStatus: null,
                    })
                  : null;
                const otherParty = otherPartyE164(row);

                return (
                  <tr
                    key={row.id}
                    className={`${trClass} ${
                      missed
                        ? "bg-rose-50/70"
                        : emphasizeUrgency && (unassigned || noContact)
                          ? "bg-amber-50/70"
                          : ""
                    }`}
                  >
                    <td
                      className={`px-4 py-3 align-top ${missed ? "border-l-4 border-red-500" : ""}`}
                    >
                      <div className="flex flex-col gap-2">
                        <div>
                          <div
                            className={`flex flex-wrap items-center gap-2 font-semibold ${
                              missed ? "text-red-950" : "text-slate-900"
                            }`}
                          >
                            {missed ? `Missed Call — ${nameOrNumber}` : nameOrNumber}
                          </div>
                          <div className="mt-0.5 text-[11px] text-slate-600">
                            {phoneLabel} · {timeLabel} · {durationLabel}
                          </div>
                          {triageReasonBadges ? (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {missed ? (
                                <span className="inline-flex rounded border border-red-300 bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-950">
                                  Missed
                                </span>
                              ) : null}
                              {unassigned ? (
                                <span className="inline-flex rounded border border-sky-300 bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-950">
                                  Unassigned
                                </span>
                              ) : null}
                              {noContact ? (
                                <span className="inline-flex rounded border border-slate-300 bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-800">
                                  No Contact
                                </span>
                              ) : null}
                            </div>
                          ) : null}
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCallBack(row)}
                            disabled={!otherParty}
                            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Call back
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleSendSmsLink(row)}
                            disabled={!otherParty}
                            className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Send SMS
                          </button>
                          {triageOwnershipQuickActions && !row.assigned_to_user_id ? (
                            <ClaimPhoneCallForm
                              callId={row.id}
                              buttonClassName={CLAIM_TRIAGE_QUICK_BUTTON_CLASS}
                              disabled={!!ownershipPendingByCallId[row.id]}
                              onSubmit={(e) => void handleOwnershipClaim(e, row.id)}
                            />
                          ) : null}
                          {triageOwnershipQuickActions && row.assigned_to_user_id && allowUnassign ? (
                            <UnassignPhoneCallForm
                              callId={row.id}
                              buttonClassName={UNASSIGN_TRIAGE_QUICK_BUTTON_CLASS}
                              disabled={!!ownershipPendingByCallId[row.id]}
                              onSubmit={(e) => void handleOwnershipUnassign(e, row.id)}
                            />
                          ) : null}
                        </div>

                        <details
                          className="w-full rounded-lg border border-slate-200 bg-slate-50/30 p-2"
                          open={expandedCallId === row.id}
                          onToggle={(e) => {
                            const open = (e.currentTarget as HTMLDetailsElement).open;
                            setExpandedCallId(open ? row.id : null);
                          }}
                        >
                          <summary className="cursor-pointer select-none text-[11px] font-semibold text-slate-700 hover:text-slate-900">
                            <span className="flex flex-col gap-0.5">
                              <span>More actions</span>
                              {triageOwnershipQuickActions ? (
                                <span className="text-[10px] font-normal font-medium text-slate-500">
                                  Assignment, intake & CRM
                                </span>
                              ) : null}
                            </span>
                          </summary>

                          {expandedCallId === row.id ? (
                            <div className="mt-2 space-y-3">
                            <div className="rounded-md border border-slate-200 bg-white p-2">
                              <div className="text-xs font-semibold text-slate-900">Assignment</div>
                              <div className="mt-2 text-sm text-slate-700">
                                {row.assigned_to_user_id ? (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-xs leading-snug">
                                      <span className="font-semibold text-slate-600">Assigned:</span>{" "}
                                      <span className="text-slate-800">{assignedLabel}</span>
                                    </span>
                                    {callVisibility === "full" && assignableStaff.length > 0 ? (
                                      <form
                                        onSubmit={(e) => void handleOwnershipAssign(e, row.id)}
                                        className="flex max-w-[16rem] flex-col gap-0.5"
                                      >
                                        <input type="hidden" name="callId" value={row.id} />
                                        <select
                                          name="assignToUserId"
                                          defaultValue={row.assigned_to_user_id}
                                          disabled={!!ownershipPendingByCallId[row.id]}
                                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-800"
                                          aria-label="Reassign call"
                                        >
                                          {assignableStaff.map((s) => (
                                            <option key={s.user_id} value={s.user_id}>
                                              {s.label}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          type="submit"
                                          disabled={!!ownershipPendingByCallId[row.id]}
                                          className="self-start rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                        >
                                          Reassign
                                        </button>
                                      </form>
                                    ) : null}
                                    {allowUnassign ? (
                                      <UnassignPhoneCallForm
                                        callId={row.id}
                                        buttonClassName={UNASSIGN_ASSIGNMENT_PANEL_BUTTON_CLASS}
                                        disabled={!!ownershipPendingByCallId[row.id]}
                                        onSubmit={(e) => void handleOwnershipUnassign(e, row.id)}
                                      />
                                    ) : null}
                                  </div>
                                ) : (
                                  <div className="flex flex-col gap-1.5">
                                    <span className="text-xs text-slate-500">Unassigned</span>
                                    <ClaimPhoneCallForm
                                      callId={row.id}
                                      buttonClassName={CLAIM_ASSIGNMENT_PANEL_BUTTON_CLASS}
                                      disabled={!!ownershipPendingByCallId[row.id]}
                                      onSubmit={(e) => void handleOwnershipClaim(e, row.id)}
                                    />
                                    {callVisibility === "full" && assignableStaff.length > 0 ? (
                                      <form
                                        onSubmit={(e) => void handleOwnershipAssign(e, row.id)}
                                        className="flex max-w-[16rem] flex-col gap-0.5"
                                      >
                                        <input type="hidden" name="callId" value={row.id} />
                                        <select
                                          name="assignToUserId"
                                          required
                                          disabled={!!ownershipPendingByCallId[row.id]}
                                          className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-800"
                                          aria-label="Assign call to staff"
                                          defaultValue=""
                                        >
                                          <option value="" disabled>
                                            Assign to…
                                          </option>
                                          {assignableStaff.map((s) => (
                                            <option key={s.user_id} value={s.user_id}>
                                              {s.label}
                                            </option>
                                          ))}
                                        </select>
                                        <button
                                          type="submit"
                                          disabled={!!ownershipPendingByCallId[row.id]}
                                          className="self-start rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                        >
                                          Assign
                                        </button>
                                      </form>
                                    ) : null}
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="rounded-md border border-slate-200 bg-white p-2">
                              <div className="text-xs font-semibold text-slate-900">Intake</div>
                              <div className="mt-2 text-sm text-slate-700">
                                {!row.contact_id && row.from_e164 ? (
                                  missed ? (
                                    <button
                                      type="button"
                                      disabled={creatingContactCallId === row.id}
                                      onClick={() => handleQuickIntakeMissedCall(row, crmPipe)}
                                      className="rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-900 hover:bg-rose-100 disabled:opacity-50"
                                    >
                                      {creatingContactCallId === row.id ? "…" : "Quick intake (missed)"}
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      disabled={creatingContactCallId === row.id}
                                      onClick={() => handleCreateContactFromCall(row)}
                                      className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      {creatingContactCallId === row.id ? "…" : "Create Contact"}
                                    </button>
                                  )
                                ) : null}

                                {row.contact_id ? (
                                  <div className="mt-2 flex flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center gap-0.5">
                                      <input
                                        type="text"
                                        name={`contactName-${row.id}`}
                                        value={contactNameInputValue(row)}
                                        onChange={(e) =>
                                          setContactNameDrafts((prev) => ({ ...prev, [row.id]: e.target.value }))
                                        }
                                        maxLength={500}
                                        autoComplete="off"
                                        aria-label="Contact name"
                                        className="min-w-0 flex-1 rounded border border-slate-200 px-1 py-0.5 text-[10px] text-slate-800"
                                      />
                                      <button
                                        type="button"
                                        disabled={
                                          savingContactNameCallId === row.id ||
                                          !contactNameInputValue(row).trim()
                                        }
                                        onClick={() => handleSaveContactName(row)}
                                        className="shrink-0 rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        {savingContactNameCallId === row.id ? "…" : "Save"}
                                      </button>
                                    </div>

                                    {row.contact_id && crmPipe?.patientStatus ? (
                                      <span className="text-[10px] font-medium text-emerald-800">
                                        Patient: {crmPipe.patientStatus}
                                      </span>
                                    ) : null}

                                    {row.contact_id &&
                                    crmPipe &&
                                    !crmPipe.patientStatus &&
                                    !crmPipe.activeLeadId ? (
                                      <button
                                        type="button"
                                        disabled={creatingLeadCallId === row.id}
                                        onClick={() => handleCreateLead(row)}
                                        className={`rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 ${
                                          missed
                                            ? "border-rose-300 bg-rose-50 font-semibold text-rose-900 hover:bg-rose-100"
                                            : ""
                                        }`}
                                      >
                                        {creatingLeadCallId === row.id
                                          ? "…"
                                          : missed
                                            ? "Quick intake (missed)"
                                            : "Create Lead"}
                                      </button>
                                    ) : null}

                                    {row.contact_id &&
                                    crmPipe &&
                                    !crmPipe.patientStatus &&
                                    crmPipe.activeLeadId ? (
                                      <button
                                        type="button"
                                        disabled={convertingLeadId === crmPipe.activeLeadId}
                                        onClick={() => handleConvertLead(row)}
                                        className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                      >
                                        {convertingLeadId === crmPipe.activeLeadId
                                          ? "…"
                                          : "Convert to Patient"}
                                      </button>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="rounded-md border border-slate-200 bg-white p-2">
                              <div className="text-xs font-semibold text-slate-900">Notes</div>
                              <div className="mt-2 text-sm text-slate-700">
                                <button
                                  type="button"
                                  onClick={() => setNoteOpenCallId((prev) => (prev === row.id ? null : row.id))}
                                  className="rounded border border-slate-300 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50"
                                >
                                  {noteOpenCallId === row.id ? "Close note" : "Add note"}
                                </button>
                                {noteOpenCallId === row.id ? (
                                  <div className="mt-2">
                                    <label className="block text-[10px] font-semibold text-slate-600">Note</label>
                                    <textarea
                                      value={noteDraftByCallId[row.id] ?? ""}
                                      onChange={(e) =>
                                        setNoteDraftByCallId((prev) => ({
                                          ...prev,
                                          [row.id]: e.target.value,
                                        }))
                                      }
                                      rows={2}
                                      maxLength={20000}
                                      className="mt-1 w-full resize-none rounded border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 outline-none focus:ring-2 focus:ring-slate-200"
                                      placeholder="e.g. Follow-up left voicemail, patient unavailable…"
                                    />
                                    <div className="mt-2 flex flex-wrap items-center gap-1">
                                      <button
                                        type="button"
                                        disabled={
                                          savingNoteCallId === row.id || !(noteDraftByCallId[row.id] ?? "").trim()
                                        }
                                        onClick={() => void handleSaveNote(row)}
                                        className="rounded border border-slate-300 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                                      >
                                        {savingNoteCallId === row.id ? "…" : "Save"}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => setNoteOpenCallId(null)}
                                        className="rounded border border-transparent bg-white px-2 py-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  </div>
                                ) : null}
                              </div>
                            </div>

                            <div className="rounded-md border border-slate-200 bg-white p-2">
                              <div className="text-xs font-semibold text-slate-900">Tasks</div>
                              <div className="mt-2 text-sm text-slate-700">
                                <p className="mb-1.5 text-xs text-slate-600">
                                  {(taskCountByCallId[row.id] ?? 0) === 0
                                    ? "No tasks"
                                    : `${taskCountByCallId[row.id]} task(s)`}
                                </p>
                                {(taskSnippetsByCallId[row.id] ?? []).length > 0 ? (
                                  <ul className="mb-1.5 space-y-0.5">
                                    {(taskSnippetsByCallId[row.id] ?? []).map((s) => (
                                      <li key={s.id} className="text-[10px] leading-snug text-slate-600">
                                        <span className="line-clamp-2" title={s.title}>
                                          {s.title}
                                        </span>
                                        <span className="text-slate-400"> · {s.status}</span>
                                      </li>
                                    ))}
                                  </ul>
                                ) : null}
                                <form
                                  action={createPhoneCallTask}
                                  className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-1"
                                >
                                  <input type="hidden" name="phoneCallId" value={row.id} />
                                  <input
                                    name="title"
                                    type="text"
                                    required
                                    maxLength={500}
                                    placeholder="Title"
                                    className="w-full min-w-0 rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-800 placeholder:text-slate-400"
                                    autoComplete="off"
                                  />
                                  <button
                                    type="submit"
                                    className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Add
                                  </button>
                                </form>
                              </div>
                            </div>

                            <div className="rounded-md border border-slate-200 bg-white p-2">
                              <div className="text-xs font-semibold text-slate-900">Follow-up</div>
                              <div className="mt-2 text-sm text-slate-700">
                                {row.priority_sms_reason ? (
                                  <p className="mb-2 text-[11px] text-violet-900">
                                    <span className="font-semibold">Priority SMS:</span>{" "}
                                    {priorityReasonLabel(row.priority_sms_reason)}
                                  </p>
                                ) : null}
                                {row.auto_reply_sms_sent_at ? (
                                  <p className="mb-2 text-[11px] text-emerald-900" title={row.auto_reply_sms_body ?? undefined}>
                                    <span className="font-semibold">Caller auto-reply:</span> sent
                                  </p>
                                ) : null}

                                {alerts.length === 0 ? (
                                  hasFollowUpHeader ? null : <span className="text-slate-400">—</span>
                                ) : (
                                  <ul className="flex flex-col gap-2">
                                    {alerts.map((n) => {
                                      const ns = n.status.trim();
                                      const fpClass = followUpPill(ns);
                                      return (
                                        <li key={n.id} className="flex flex-col gap-1">
                                          <div className="flex flex-wrap items-center gap-1.5">
                                            <span className="text-xs text-slate-600">
                                              {n.type === "voicemail" ? "Voicemail" : "Missed"}
                                            </span>
                                            <span className={fpClass}>{ns}</span>
                                          </div>
                                          {n.last_sms_error ? (
                                            <p
                                              className="max-w-[220px] text-[10px] leading-snug text-amber-900/90"
                                              title={n.last_sms_error}
                                            >
                                              SMS:{" "}
                                              {n.last_sms_error.length > 120
                                                ? `${n.last_sms_error.slice(0, 117)}…`
                                                : n.last_sms_error}
                                            </p>
                                          ) : n.last_sms_attempt_at ? (
                                            <p className="text-[10px] text-slate-500">SMS request accepted</p>
                                          ) : null}
                                          {n.status.trim() === "new" ? (
                                            <div className="flex flex-wrap gap-1">
                                              <form action={updatePhoneCallNotification}>
                                                <input type="hidden" name="notificationId" value={n.id} />
                                                <input type="hidden" name="intent" value="acknowledge" />
                                                <button
                                                  type="submit"
                                                  className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                  Ack
                                                </button>
                                              </form>
                                              <form action={updatePhoneCallNotification}>
                                                <input type="hidden" name="notificationId" value={n.id} />
                                                <input type="hidden" name="intent" value="resolve" />
                                                <button
                                                  type="submit"
                                                  className="rounded-md border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                                >
                                                  Resolve
                                                </button>
                                              </form>
                                            </div>
                                          ) : null}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </div>

                            <div className="rounded-md border border-slate-200 bg-white p-2">
                              <div className="text-xs font-semibold text-slate-900">Tag</div>
                              <div className="mt-2">
                                <form
                                  action={updatePhoneCallPrimaryTag}
                                  className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-0.5"
                                >
                                  <input type="hidden" name="phoneCallId" value={row.id} />
                                  <select
                                    name="primaryTag"
                                    defaultValue={row.primary_tag ?? ""}
                                    className="w-full max-w-[8rem] rounded border border-slate-200 bg-white px-1 py-0.5 text-[11px] text-slate-800"
                                  >
                                    <option value="">Untagged</option>
                                    <option value="patient">patient</option>
                                    <option value="referral">referral</option>
                                    <option value="caregiver">caregiver</option>
                                    <option value="family">family</option>
                                    <option value="vendor">vendor</option>
                                    <option value="spam">spam</option>
                                    <option value="other">other</option>
                                  </select>
                                  <button
                                    type="submit"
                                    className="shrink-0 rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                                  >
                                    Save
                                  </button>
                                </form>
                              </div>
                            </div>

                            <div className="rounded-md border border-slate-200 bg-white p-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs font-semibold text-slate-900">Call info</div>
                                <Link
                                  href={`/admin/phone/${row.id}`}
                                  className="text-[11px] font-semibold text-sky-800 underline-offset-2 hover:underline"
                                >
                                  Open
                                </Link>
                              </div>
                              <dl className="mt-2 grid gap-x-4 gap-y-1 text-[11px] text-slate-600 sm:grid-cols-2">
                                <div>
                                  Direction: <span className="font-medium text-slate-700">{row.direction}</span>
                                </div>
                                <div>
                                  To: <span className="font-mono text-slate-700">{row.to_e164 ?? "—"}</span>
                                </div>
                                <div>
                                  Voicemail:{" "}
                                  <span className="font-medium text-slate-700">
                                    {row.voicemail_recording_sid
                                      ? `Yes${row.voicemail_duration_seconds != null ? ` · ${row.voicemail_duration_seconds}s` : ""}`
                                      : "—"}
                                  </span>
                                </div>
                                <div className="min-w-0">
                                  External ID:{" "}
                                  <span className="font-mono text-slate-700">{row.external_call_id ?? "—"}</span>
                                </div>
                              </dl>
                            </div>
                          </div>
                          ) : null}
                        </details>
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-1">
                        <span className={statusPillClass}>{st}</span>
                        {missed ? <span className="text-[11px] font-semibold text-red-900">Missed</span> : null}
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top">
                      <div className="flex flex-col gap-0.5">
                        <span className="font-mono text-xs text-slate-700">{timeLabel}</span>
                        <span className="text-[11px] text-slate-500">{durationLabel}</span>
                      </div>
                    </td>

                    <td className="px-4 py-3 align-top">
                      {emphasizeAssignmentVisibility ? (
                        row.assigned_to_user_id ? (
                          <div className="flex min-w-0 max-w-[14rem] flex-col gap-0.5">
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              Assigned to
                            </span>
                            <span className="truncate text-sm font-semibold leading-tight text-slate-900" title={assignedLabel}>
                              {assignedLabel}
                            </span>
                          </div>
                        ) : (
                          <span className="inline-flex rounded-md border border-amber-400 bg-amber-50 px-2 py-1 text-xs font-bold tracking-tight text-amber-950 shadow-sm">
                            Unassigned
                          </span>
                        )
                      ) : (
                        <span
                          className={`text-xs font-semibold ${row.assigned_to_user_id ? "text-slate-800" : "text-slate-500"}`}
                        >
                          {assignedLabel}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
