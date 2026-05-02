"use client";

import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  bulkSoftDeleteLeads,
  markLeadDeadFromList,
  quickMarkLeadLeftVoicemail,
  quickMarkLeadNoResponse,
  quickMarkLeadSpoke,
  quickSetLeadTemperature,
} from "@/app/admin/crm/actions";
import type { LeadTemperature } from "@/lib/crm/lead-temperature";
import { leadTemperatureLabel, normalizeLeadTemperature } from "@/lib/crm/lead-temperature";
import { LeadDeleteButton } from "@/app/admin/crm/leads/_components/LeadDeleteButton";
import { crmListRowHoverCls, crmListScrollOuterCls } from "@/components/admin/crm-admin-list-styles";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";
import { parseEmploymentApplicationMeta } from "@/lib/crm/lead-employment-meta";
import {
  contactStageBadgeLabel,
  lastContactHumanLine,
  lastContactToneClass,
  leadRowCardClass,
  followUpUrgency,
  shouldShowPipelineStatusOnLeadRow,
} from "@/lib/crm/crm-leads-list-visual";
import { formatLeadPipelineStatusLabel } from "@/lib/crm/lead-pipeline-status";
import {
  contactDisplayName,
  contactEmail,
  formatFollowUpListLabel,
  normalizeContact,
  staffPrimaryLabel,
  type CrmLeadRow,
} from "@/lib/crm/crm-leads-table-helpers";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  buildWorkspaceInboxLeadSmsHref,
  buildWorkspaceKeypadCallHref,
  buildWorkspaceSmsToContactHref,
  pickOutboundE164ForDial,
} from "@/lib/workspace-phone/launch-urls";

const pillBase = "inline-flex max-w-full shrink-0 rounded-full px-1 py-[1px] text-[9px] font-semibold ring-1";

function relativeCreatedParts(iso: string): { short: string; full: string } {
  const d = new Date(iso);
  const full = Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
  if (Number.isNaN(d.getTime())) return { short: "—", full };
  const diffMs = Date.now() - d.getTime();
  if (!Number.isFinite(diffMs)) return { short: "—", full };
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return { short: "just now", full };
  if (mins < 60) return { short: `${mins}m ago`, full };
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return { short: `${hrs}h ago`, full };
  const days = Math.round(hrs / 24);
  if (days < 14) return { short: `${days}d ago`, full };
  return { short: d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }), full };
}

function LeadTypeBadge({ leadType, status }: { leadType: string | null; status: string | null }) {
  if (leadType === "employee") {
    return (
      <span className={`${pillBase} bg-indigo-50 text-indigo-900 ring-indigo-200/70`}>Employee</span>
    );
  }
  const st = (status ?? "").trim().toLowerCase();
  if (st === "converted") {
    return <span className={`${pillBase} bg-emerald-50 text-emerald-900 ring-emerald-200/70`}>Patient</span>;
  }
  return <span className={`${pillBase} bg-sky-50 text-sky-900 ring-sky-200/70`}>Lead</span>;
}

function CompactContactLines({
  phoneDisplay,
  email,
  dense,
}: {
  phoneDisplay: string | null;
  email: string | null;
  dense?: boolean;
}) {
  if (!phoneDisplay && !email) {
    return <span className={`text-slate-400 ${dense ? "text-[9px]" : "text-[10px]"}`}>No phone or email</span>;
  }
  return (
    <div className={`flex min-w-0 flex-col ${dense ? "gap-px text-[10px]" : "gap-0.5 text-[11px]"} leading-tight text-slate-600`}>
      {phoneDisplay ? (
        <div className="flex items-center justify-end gap-1 tabular-nums md:justify-start">
          <Phone className={`${dense ? "h-2.5 w-2.5" : "h-3 w-3"} shrink-0 text-slate-400`} aria-hidden />
          <span>{phoneDisplay}</span>
        </div>
      ) : null}
      {email ? (
        <div className="flex min-w-0 items-center justify-end gap-1 md:justify-start">
          <Mail className={`${dense ? "h-2.5 w-2.5" : "h-3 w-3"} shrink-0 text-slate-400`} aria-hidden />
          <span className="truncate" title={email}>
            {email}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function LeadActionButtonRow({
  leadId,
  phone,
  keypadHref,
  smsHref,
  compact,
}: {
  leadId: string;
  phone: string;
  keypadHref: string | null;
  smsHref: string | null;
  compact?: boolean;
}) {
  const detailHref = `/admin/crm/leads/${leadId}`;
  const pad = compact ? "px-1.5 py-0.5 text-[9px]" : "px-2 py-1 text-[10px]";
  const primary =
    `inline-flex items-center justify-center rounded-md border ${pad} font-semibold shadow-sm transition hover:shadow`;
  const secondary = `inline-flex items-center justify-center rounded-md border border-slate-200 bg-white ${pad} font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50`;
  const disabled = `inline-flex cursor-not-allowed items-center justify-center rounded-md border border-slate-100 bg-slate-50 ${pad} font-semibold text-slate-400 opacity-60 shadow-none`;

  return (
    <div className="flex w-full shrink-0 flex-nowrap items-center justify-end gap-1">
      {keypadHref ? (
        <Link
          href={keypadHref}
          prefetch={false}
          className={`${primary} border-emerald-200 bg-emerald-50/80 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-50`}
        >
          Call
        </Link>
      ) : (
        <span className={disabled} title={phone ? undefined : "No dialable phone"}>
          Call
        </span>
      )}
      {smsHref ? (
        <Link
          href={smsHref}
          prefetch={false}
          className={`${primary} border-sky-200 bg-sky-50/80 text-sky-900 hover:border-sky-300 hover:bg-sky-50`}
        >
          Text
        </Link>
      ) : (
        <span className={disabled} title={phone ? undefined : "No SMS"}>
          Text
        </span>
      )}
      <Link href={detailHref} className={secondary}>
        View
      </Link>
      <LeadDeleteButton leadId={leadId} variant="tableInlineGhost" />
    </div>
  );
}

/** Same targets as `LeadActionButtonRow`, visible on small screens where the wide table is scrolled off-screen. */
function LeadRowMobileDialRow({
  keypadHref,
  smsHref,
  phone,
  compact,
}: {
  keypadHref: string | null;
  smsHref: string | null;
  phone: string;
  compact?: boolean;
}) {
  const h = compact ? "min-h-[28px]" : "min-h-[32px]";
  const primary = `inline-flex ${h} flex-1 items-center justify-center rounded-md border px-2 py-0.5 text-[10px] font-semibold shadow-sm transition hover:shadow`;
  const disabled = `inline-flex ${h} flex-1 cursor-not-allowed items-center justify-center rounded-md border border-slate-100 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-400 opacity-60 shadow-none`;

  return (
    <div className="flex w-full min-w-0 gap-1.5 pt-1 md:hidden">
      {keypadHref ? (
        <Link
          href={keypadHref}
          prefetch={false}
          className={`${primary} border-emerald-200 bg-emerald-50/80 text-emerald-900 hover:border-emerald-300 hover:bg-emerald-50`}
        >
          Call
        </Link>
      ) : (
        <span className={disabled} title={phone ? undefined : "No dialable phone"}>
          Call
        </span>
      )}
      {smsHref ? (
        <Link
          href={smsHref}
          prefetch={false}
          className={`${primary} border-sky-200 bg-sky-50/80 text-sky-900 hover:border-sky-300 hover:bg-sky-50`}
        >
          Text
        </Link>
      ) : (
        <span className={disabled} title={phone ? undefined : "No SMS"}>
          Text
        </span>
      )}
    </div>
  );
}

const checkboxClsComfortable =
  "h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500/30";

const checkboxClsCompact =
  "h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500/30";

type StaffOpt = {
  user_id: string;
  email: string | null;
  role: string;
  full_name: string | null;
};

type Props = {
  initialList: CrmLeadRow[];
  employeeOnlyView: boolean;
  staffOptions: StaffOpt[];
  /** Central CRM calendar YYYY-MM-DD for urgency + last-contact copy */
  todayIso: string;
  /** Latest SMS thread id per CRM contact for "Text" deep-links (navigation only). */
  smsConversationIdByContactId?: Record<string, string>;
  /** Mirrors URL `density` — default Compact for admins. Does not alter server filtering. */
  initialDensity?: "compact" | "comfortable";
  emptyState?: {
    narrowFiltersActive: boolean;
    clearHref: string;
  };
};

const quickBtnCls =
  "inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50";

const TEMP_OPTIONS: { value: LeadTemperature; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "dead", label: "Dead" },
];

function leadTemperaturePillClass(t: LeadTemperature, selected: boolean, compact?: boolean): string {
  const base = compact
    ? "inline-flex min-w-[2.25rem] shrink-0 items-center justify-center rounded border px-[3px] py-[1px] text-[9px] font-semibold transition disabled:opacity-50"
    : "inline-flex min-w-[2.75rem] shrink-0 items-center justify-center rounded-md border px-1 py-0.5 text-[10px] font-semibold transition disabled:opacity-50";
  if (!selected) {
    return `${base} border-slate-200/90 bg-white text-slate-600 shadow-sm hover:border-slate-300 hover:bg-slate-50`;
  }
  switch (t) {
    case "hot":
      return `${base} border-rose-600 bg-rose-600 text-white shadow-sm ring-1 ring-rose-700/30`;
    case "warm":
      return `${base} border-amber-500 bg-amber-400 text-amber-950 shadow-sm ring-1 ring-amber-600/25`;
    case "cool":
      return `${base} border-slate-500 bg-slate-400 text-white shadow-sm ring-1 ring-slate-600/25`;
    case "dead":
      return `${base} border-stone-500 bg-stone-500 text-stone-100 shadow-sm ring-1 ring-stone-700/30`;
    default:
      return `${base} border-slate-200 bg-white text-slate-600`;
  }
}

function LeadTemperatureQuickSet({
  leadId,
  value,
  compact,
}: {
  leadId: string;
  value: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const current = normalizeLeadTemperature(value);

  const onPick = (next: LeadTemperature) => {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("leadId", leadId);
      fd.set("lead_temperature", next);
      const r = await quickSetLeadTemperature(fd);
      if (r.ok) router.refresh();
    });
  };

  return (
    <div className={compact ? "pt-0.5" : "pt-1"} role="group" aria-label="Lead priority">
      <p className={`${compact ? "mb-px text-[8px]" : "mb-0.5 text-[9px]"} font-semibold uppercase tracking-wide text-slate-500`}>Priority</p>
      <div className="flex flex-wrap gap-px">
        {TEMP_OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            disabled={pending}
            title={`Set priority: ${o.label}`}
            onClick={() => onPick(o.value)}
            className={leadTemperaturePillClass(o.value, current === o.value, compact)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function LeadQuickActions({ leadId, compact }: { leadId: string; compact?: boolean }) {
  const router = useRouter();
  const qcls = compact
    ? `${quickBtnCls} px-1 py-px text-[9px]`
    : quickBtnCls;

  return (
    <div className={`flex flex-wrap ${compact ? "gap-px pt-px" : "gap-0.5 pt-0.5"}`}>
      <form
        action={async (fd) => {
          const r = await quickMarkLeadSpoke(fd);
          if (r.ok) router.refresh();
        }}
        className="inline"
      >
        <input type="hidden" name="leadId" value={leadId} />
        <button type="submit" className={qcls} title="Log last contact as Spoke (call)">
          Spoke
        </button>
      </form>
      <form
        action={async (fd) => {
          const r = await quickMarkLeadLeftVoicemail(fd);
          if (r.ok) router.refresh();
        }}
        className="inline"
      >
        <input type="hidden" name="leadId" value={leadId} />
        <button type="submit" className={qcls} title="Log last contact as Left voicemail (call)">
          Left VM
        </button>
      </form>
      <form
        action={async (fd) => {
          const r = await quickMarkLeadNoResponse(fd);
          if (r.ok) router.refresh();
        }}
        className="inline"
      >
        <input type="hidden" name="leadId" value={leadId} />
        <button type="submit" className={qcls} title="Manual: no response after multiple attempts">
          No response
        </button>
      </form>
      <form
        action={async (fd) => {
          const r = await markLeadDeadFromList(fd);
          if (r.ok) router.refresh();
        }}
        className="inline"
      >
        <input type="hidden" name="leadId" value={leadId} />
        <button type="submit" className={`${qcls} border-rose-200/80 text-rose-800 hover:bg-rose-50/80`} title="Mark this lead as dead">
          Dead
        </button>
      </form>
    </div>
  );
}

function glanceTemperaturePillClass(t: LeadTemperature): string {
  switch (t) {
    case "hot":
      return "bg-rose-100 text-rose-900 ring-rose-300/80";
    case "warm":
      return "bg-amber-100 text-amber-950 ring-amber-300/80";
    case "cool":
      return "bg-slate-200 text-slate-800 ring-slate-400/70";
    case "dead":
      return "bg-stone-200 text-stone-700 ring-stone-400/80";
    default:
      return "bg-slate-100 text-slate-800 ring-slate-200/80";
  }
}

function followUpValueClass(fu: ReturnType<typeof followUpUrgency>): string {
  if (fu === "overdue") return "font-medium text-rose-800";
  if (fu === "today") return "font-medium text-amber-900";
  return "text-slate-700";
}

export function CrmLeadsList({
  initialList,
  employeeOnlyView,
  staffOptions,
  todayIso,
  smsConversationIdByContactId = {},
  initialDensity = "compact",
  emptyState,
}: Props) {
  const router = useRouter();
  const comfy = initialDensity === "comfortable";
  const compact = !comfy;
  const chkClass = comfy ? checkboxClsComfortable : checkboxClsCompact;
  const hdrPad = comfy ? "px-3 py-1.5 gap-x-3" : "px-2 py-1 gap-x-1.5";
  const rowPad = comfy ? "px-3 py-1.5 gap-x-3 gap-y-1" : "px-1.5 py-0.5 gap-x-1.5 gap-y-0.5";
  const nameSz = comfy ? "text-[15px] font-bold" : "text-sm font-semibold";

  const [rows, setRows] = useState(initialList);

  useEffect(() => {
    setRows(initialList);
  }, [initialList]);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const selectAllRef = useRef<HTMLInputElement>(null);

  const staffById = useMemo(() => new Map(staffOptions.map((s) => [s.user_id, s])), [staffOptions]);

  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const someSelected = selected.size > 0;

  useEffect(() => {
    const el = selectAllRef.current;
    if (!el) return;
    el.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  const toggleOne = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (rowIds.length === 0) return new Set();
      const all = rowIds.every((id) => prev.has(id));
      if (all) return new Set();
      return new Set(rowIds);
    });
  }, [rowIds]);

  const runBulkDelete = useCallback(() => {
    const idsToDelete = Array.from(selected);
    if (idsToDelete.length === 0) return;
    const remove = new Set(idsToDelete);
    startTransition(async () => {
      const result = await bulkSoftDeleteLeads(idsToDelete);
      if (result.ok) {
        setRows((prev) => prev.filter((r) => !remove.has(r.id)));
        setSelected(new Set());
        setBulkConfirmOpen(false);
        router.refresh();
      }
    });
  }, [selected, router]);

  const bulkBar =
    someSelected ? (
      <div
        className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 shadow-sm ${compact ? "px-3 py-1.5 text-xs" : "px-4 py-2.5 text-sm"}`}
      >
        <span className="font-medium text-slate-700">{selected.size} selected</span>
        <button
          type="button"
          onClick={() => setBulkConfirmOpen(true)}
          className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-800 shadow-sm hover:bg-rose-50"
        >
          Delete Selected
        </button>
      </div>
    ) : null;

  const bulkModal = bulkConfirmOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={() => !pending && setBulkConfirmOpen(false)}
    >
      <div
        role="dialog"
        aria-modal
        aria-labelledby="crm-bulk-delete-title"
        className="max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="crm-bulk-delete-title" className="text-lg font-semibold text-slate-900">
          Delete {selected.size} lead{selected.size === 1 ? "" : "s"}?
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          This will remove the selected leads from the active CRM list but keep historical records.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
            onClick={() => setBulkConfirmOpen(false)}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg border border-rose-800 bg-rose-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-rose-700 disabled:opacity-60"
            onClick={runBulkDelete}
            disabled={pending}
          >
            {pending ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const listGrid =
    "md:grid-cols-[2rem_minmax(12rem,1.35fr)_minmax(11rem,1.05fr)_minmax(10.5rem,1fr)_minmax(4.25rem,auto)]";

  return (
    <div className="space-y-3">
      {bulkBar}
      <div className={crmListScrollOuterCls}>
        {employeeOnlyView ? (
          <div className="min-w-[940px] text-sm">
            <div
              className={`hidden border-b border-slate-100 bg-slate-50/90 ${hdrPad} text-[11px] font-semibold tracking-tight text-slate-600 md:grid ${listGrid}`}
            >
              <div className="flex items-center justify-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className={chkClass}
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={rowIds.length === 0}
                  aria-label="Select all leads"
                />
              </div>
              <div>Lead</div>
              <div>Pipeline</div>
              <div className="text-right">Contact</div>
              <div className="text-right">Created</div>
            </div>
            {rows.length === 0 ? (
              <div className="space-y-3 px-4 py-8 text-center text-sm text-slate-600 md:text-left">
                <p className="font-medium text-slate-800">{emptyState?.narrowFiltersActive ? "No leads match these filters." : "No leads found."}</p>
                <p className="text-xs text-slate-500">
                  {emptyState?.narrowFiltersActive
                    ? "Adjust search or filters, check pagination, or clear all filters."
                    : "No open leads match the default list (dead / not qualified are hidden unless you include them)."}
                </p>
                {emptyState?.narrowFiltersActive && emptyState.clearHref ? (
                  <Link
                    href={emptyState.clearHref}
                    prefetch={false}
                    className="inline-flex rounded-lg border border-sky-600 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                  >
                    Clear all filters
                  </Link>
                ) : null}
              </div>
            ) : (
              rows.map((r) => {
                const contact = normalizeContact(r.contacts);
                const displayName = contactDisplayName(contact);
                const phone = (contact?.primary_phone ?? "").trim();
                const email = contactEmail(contact);
                const owner = r.owner_user_id ? staffById.get(r.owner_user_id) : null;
                const cid = typeof r.contact_id === "string" ? r.contact_id.trim() : "";
                const dialE164 = pickOutboundE164ForDial(phone);
                const keypadHref = dialE164
                  ? buildWorkspaceKeypadCallHref({
                      dial: dialE164,
                      leadId: r.id,
                      contactId: cid,
                      contextName: displayName,
                    })
                  : null;
                const existingConv = cid ? smsConversationIdByContactId[cid] : undefined;
                const smsHref =
                  cid && pickOutboundE164ForDial(phone)
                    ? existingConv
                      ? buildWorkspaceInboxLeadSmsHref({ conversationId: existingConv, leadId: r.id })
                      : buildWorkspaceSmsToContactHref({ contactId: cid, leadId: r.id })
                    : null;
                const emp = parseEmploymentApplicationMeta(r.external_source_metadata);
                const role = (emp?.position ?? "").trim() || "—";
                const exp = (emp?.years_experience ?? "").trim() || "—";
                const resume = (emp?.resume_url ?? "").trim();
                const nextActionLabel = formatLeadNextActionLabel(r.next_action);
                const detailHref = `/admin/crm/leads/${r.id}`;
                const fu = followUpUrgency(r.follow_up_date, todayIso);
                const lcHuman = lastContactHumanLine(r.last_contact_at, r.last_outcome, todayIso, r.status);
                const contactStage = contactStageBadgeLabel(r);

                return (
                  <div
                    key={r.id}
                    className={`grid grid-cols-1 border-b border-slate-100 transition-colors last:border-0 md:items-start ${rowPad} ${listGrid} ${leadRowCardClass(r, fu)} ${crmListRowHoverCls}`}
                  >
                    <div className={`flex items-start justify-center ${compact ? "md:pt-0.5" : "pt-0.5 md:pt-1"}`}>
                      <input
                        type="checkbox"
                        className={chkClass}
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select lead ${displayName}`}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link
                          href={detailHref}
                          className={`min-w-0 ${nameSz} leading-tight text-slate-900 hover:text-sky-800 hover:underline`}
                        >
                          {displayName}
                        </Link>
                        <span
                          className={`${pillBase} max-w-[min(100%,14rem)] truncate ${contactStage.badgeClass}`}
                          title={contactStage.label}
                        >
                          {contactStage.label}
                        </span>
                        {normalizeLeadTemperature(r.lead_temperature ?? null) ? (
                          <span
                            className={`${pillBase} shrink-0 ${glanceTemperaturePillClass(normalizeLeadTemperature(r.lead_temperature ?? null)!)}`}
                            title="Lead priority (triage)"
                          >
                            {leadTemperatureLabel(normalizeLeadTemperature(r.lead_temperature ?? null))}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <LeadTypeBadge leadType={r.lead_type} status={r.status} />
                        <span className="text-[10px] text-slate-500">
                          {formatLeadSourceLabel(r.source)}
                          {shouldShowPipelineStatusOnLeadRow(r.status) ? (
                            <span className="text-slate-400"> · {formatLeadPipelineStatusLabel(r.status)}</span>
                          ) : null}
                        </span>
                      </div>
                      <LeadRowMobileDialRow compact={compact} keypadHref={keypadHref} smsHref={smsHref} phone={phone} />
                      <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0 text-[10px] text-slate-600 md:text-[11px]">
                        <span className="font-medium">{role}</span>
                        {exp !== "—" ? <span>· {exp}</span> : null}
                        {(r.referral_source ?? "").trim() ? (
                          <span className="text-slate-500">· {(r.referral_source ?? "").trim()}</span>
                        ) : null}
                        {resume ? (
                          <>
                            ·{" "}
                            <a href={resume} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-800 underline-offset-2 hover:underline">
                              Resume
                            </a>
                          </>
                        ) : null}
                      </div>
                    </div>
                    <div className={`min-w-0 ${compact ? "space-y-1 text-[10px] leading-tight text-slate-700" : "space-y-1 text-[11px] leading-snug text-slate-600"}`}>
                      {compact ? (
                        <>
                          <div className="space-y-0.5 text-[10px] leading-snug text-slate-800">
                            <p>
                              <span className="text-slate-400">Next:</span>{" "}
                              {nextActionLabel !== "—" ? nextActionLabel : "None"}
                              <span className="text-slate-300"> · </span>
                              <span className="text-slate-400">F/U:</span>{" "}
                              <span className={followUpValueClass(fu)}>
                                {formatFollowUpListLabel(r.follow_up_date, r.follow_up_at)}
                              </span>
                            </p>
                            <p>
                              <span className="text-slate-400">Last:</span>{" "}
                              <span className={`font-normal ${lastContactToneClass(lcHuman.tone)}`}>{lcHuman.line}</span>
                              <span className="text-slate-300"> · </span>
                              <span className="text-slate-400">Owner:</span> {owner ? staffPrimaryLabel(owner) : "—"}
                            </p>
                          </div>
                          <LeadQuickActions compact leadId={r.id} />
                          <LeadTemperatureQuickSet compact leadId={r.id} value={r.lead_temperature ?? null} />
                        </>
                      ) : (
                        <>
                          <p className="text-[13px] leading-snug text-slate-900">
                            <span className="font-normal text-slate-500">Next: </span>
                            {nextActionLabel !== "—" ? (
                              <span className="font-semibold text-slate-900">{nextActionLabel}</span>
                            ) : (
                              <span className="font-normal text-slate-400">No next action</span>
                            )}
                          </p>
                          <div>
                            <span className="text-slate-500">Follow-up: </span>
                            <span className={followUpValueClass(fu)}>{formatFollowUpListLabel(r.follow_up_date, r.follow_up_at)}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            <span className="text-slate-400">Last contact: </span>
                            <span className={`font-normal ${lastContactToneClass(lcHuman.tone)}`}>{lcHuman.line}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Owner: </span>
                            {owner ? staffPrimaryLabel(owner) : "—"}
                          </div>
                          <LeadQuickActions leadId={r.id} />
                          <LeadTemperatureQuickSet leadId={r.id} value={r.lead_temperature ?? null} />
                        </>
                      )}
                    </div>
                    <div className={`flex min-w-0 flex-col md:items-end ${compact ? "gap-1" : "gap-2"}`}>
                      <CompactContactLines dense={compact} phoneDisplay={phone ? formatPhoneForDisplay(phone) : null} email={email || null} />
                      <LeadActionButtonRow compact={compact} leadId={r.id} phone={phone} keypadHref={keypadHref} smsHref={smsHref} />
                    </div>
                    <div
                      className={`text-right tabular-nums text-slate-500 ${compact ? "text-[10px] leading-tight md:max-w-none" : "whitespace-nowrap text-[11px] md:pt-1"}`}
                    >
                      {(() => {
                        const c = relativeCreatedParts(r.created_at);
                        return <span title={c.full}>{compact ? c.short : c.full}</span>;
                      })()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="min-w-[940px] text-sm">
            <div
              className={`hidden border-b border-slate-100 bg-slate-50/90 ${hdrPad} text-[11px] font-semibold tracking-tight text-slate-600 md:grid ${listGrid}`}
            >
              <div className="flex items-center justify-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className={chkClass}
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={rowIds.length === 0}
                  aria-label="Select all leads"
                />
              </div>
              <div>Lead</div>
              <div>Pipeline</div>
              <div className="text-right">Contact</div>
              <div className="text-right">Created</div>
            </div>
            {rows.length === 0 ? (
              <div className="space-y-3 px-4 py-8 text-center text-sm text-slate-600 md:text-left">
                <p className="font-medium text-slate-800">{emptyState?.narrowFiltersActive ? "No leads match these filters." : "No leads found."}</p>
                <p className="text-xs text-slate-500">
                  {emptyState?.narrowFiltersActive
                    ? "Adjust search or filters, check pagination, or clear all filters."
                    : "No open leads match the default list (dead / not qualified are hidden unless you include them)."}
                </p>
                {emptyState?.narrowFiltersActive && emptyState.clearHref ? (
                  <Link
                    href={emptyState.clearHref}
                    prefetch={false}
                    className="inline-flex rounded-lg border border-sky-600 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-900 hover:bg-sky-100"
                  >
                    Clear all filters
                  </Link>
                ) : null}
              </div>
            ) : (
              rows.map((r) => {
                const contact = normalizeContact(r.contacts);
                const displayName = contactDisplayName(contact);
                const phone = (contact?.primary_phone ?? "").trim();
                const email = contactEmail(contact);
                const owner = r.owner_user_id ? staffById.get(r.owner_user_id) : null;
                const cid = typeof r.contact_id === "string" ? r.contact_id.trim() : "";
                const dialE164 = pickOutboundE164ForDial(phone);
                const keypadHref = dialE164
                  ? buildWorkspaceKeypadCallHref({
                      dial: dialE164,
                      leadId: r.id,
                      contactId: cid,
                      contextName: displayName,
                    })
                  : null;
                const existingConv = cid ? smsConversationIdByContactId[cid] : undefined;
                const smsHref =
                  cid && pickOutboundE164ForDial(phone)
                    ? existingConv
                      ? buildWorkspaceInboxLeadSmsHref({ conversationId: existingConv, leadId: r.id })
                      : buildWorkspaceSmsToContactHref({ contactId: cid, leadId: r.id })
                    : null;
                const isEmployee = r.lead_type === "employee";
                const emp = parseEmploymentApplicationMeta(r.external_source_metadata);
                const role = (emp?.position ?? "").trim();
                const exp = (emp?.years_experience ?? "").trim();
                const resume = (emp?.resume_url ?? "").trim();
                const detailHref = `/admin/crm/leads/${r.id}`;
                const nextActionLabel = formatLeadNextActionLabel(r.next_action);
                const fu = followUpUrgency(r.follow_up_date, todayIso);
                const lcHuman = lastContactHumanLine(r.last_contact_at, r.last_outcome, todayIso, r.status);
                const contactStage = contactStageBadgeLabel(r);

                return (
                  <div
                    key={r.id}
                    className={`grid grid-cols-1 border-b border-slate-100 transition-colors last:border-0 md:items-start ${rowPad} ${listGrid} ${leadRowCardClass(r, fu)} ${crmListRowHoverCls}`}
                  >
                    <div className={`flex items-start justify-center ${compact ? "md:pt-0.5" : "pt-0.5 md:pt-1"}`}>
                      <input
                        type="checkbox"
                        className={chkClass}
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select lead ${displayName}`}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link
                          href={detailHref}
                          className={`min-w-0 ${nameSz} leading-tight text-slate-900 hover:text-sky-800 hover:underline`}
                        >
                          {displayName}
                        </Link>
                        <span
                          className={`${pillBase} max-w-[min(100%,14rem)] truncate ${contactStage.badgeClass}`}
                          title={contactStage.label}
                        >
                          {contactStage.label}
                        </span>
                        {normalizeLeadTemperature(r.lead_temperature ?? null) ? (
                          <span
                            className={`${pillBase} shrink-0 ${glanceTemperaturePillClass(normalizeLeadTemperature(r.lead_temperature ?? null)!)}`}
                            title="Lead priority (triage)"
                          >
                            {leadTemperatureLabel(normalizeLeadTemperature(r.lead_temperature ?? null))}
                          </span>
                        ) : null}
                        {!isEmployee && r.waiting_on_doctors_orders === true ? (
                          <span
                            className={`${pillBase} max-w-[min(100%,18rem)] bg-rose-600 ${compact ? "px-1.5 py-[1px] text-[8px]" : "px-2 py-1 text-[10px]"} font-extrabold uppercase tracking-wide text-white shadow-md ring-2 ring-rose-300`}
                            title="Unsigned physician orders — do not schedule"
                          >
                            WAITING ON DOCTOR&apos;S ORDERS
                          </span>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <LeadTypeBadge leadType={r.lead_type} status={r.status} />
                        <span className="text-[10px] text-slate-500">
                          {formatLeadSourceLabel(r.source)}
                          {shouldShowPipelineStatusOnLeadRow(r.status) ? (
                            <span className="text-slate-400"> · {formatLeadPipelineStatusLabel(r.status)}</span>
                          ) : null}
                        </span>
                      </div>
                      <LeadRowMobileDialRow compact={compact} keypadHref={keypadHref} smsHref={smsHref} phone={phone} />
                      {isEmployee ? (
                        <div className="flex flex-wrap items-baseline gap-x-1 gap-y-0 text-[10px] text-slate-600 md:text-[11px]">
                          <span className="font-medium">{role || "—"}</span>
                          {exp ? <span>· {exp}</span> : null}
                          {(r.referral_source ?? "").trim() ? (
                            <span className="text-slate-500">· {(r.referral_source ?? "").trim()}</span>
                          ) : null}
                          {resume ? (
                            <>
                              ·{" "}
                              <a href={resume} target="_blank" rel="noopener noreferrer" className="font-semibold text-sky-800 underline-offset-2 hover:underline">
                                Resume
                              </a>
                            </>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className={`min-w-0 ${compact ? "space-y-1 text-[10px] leading-tight text-slate-700" : "space-y-1 text-[11px] leading-snug text-slate-600"}`}>
                      {compact ? (
                        <>
                          <div className="space-y-0.5 text-[10px] leading-snug text-slate-800">
                            <p>
                              <span className="text-slate-400">Next:</span>{" "}
                              {nextActionLabel !== "—" ? nextActionLabel : "None"}
                              <span className="text-slate-300"> · </span>
                              <span className="text-slate-400">F/U:</span>{" "}
                              <span className={followUpValueClass(fu)}>
                                {formatFollowUpListLabel(r.follow_up_date, r.follow_up_at)}
                              </span>
                            </p>
                            <p>
                              <span className="text-slate-400">Last:</span>{" "}
                              <span className={`font-normal ${lastContactToneClass(lcHuman.tone)}`}>{lcHuman.line}</span>
                              <span className="text-slate-300"> · </span>
                              <span className="text-slate-400">Owner:</span> {owner ? staffPrimaryLabel(owner) : "—"}
                            </p>
                          </div>
                          <LeadQuickActions compact leadId={r.id} />
                          <LeadTemperatureQuickSet compact leadId={r.id} value={r.lead_temperature ?? null} />
                        </>
                      ) : (
                        <>
                          <p className="text-[13px] leading-snug text-slate-900">
                            <span className="font-normal text-slate-500">Next: </span>
                            {nextActionLabel !== "—" ? (
                              <span className="font-semibold text-slate-900">{nextActionLabel}</span>
                            ) : (
                              <span className="font-normal text-slate-400">No next action</span>
                            )}
                          </p>
                          <div>
                            <span className="text-slate-500">Follow-up: </span>
                            <span className={followUpValueClass(fu)}>{formatFollowUpListLabel(r.follow_up_date, r.follow_up_at)}</span>
                          </div>
                          <div className="text-[10px] text-slate-400">
                            <span className="text-slate-400">Last contact: </span>
                            <span className={`font-normal ${lastContactToneClass(lcHuman.tone)}`}>{lcHuman.line}</span>
                          </div>
                          <div>
                            <span className="text-slate-500">Owner: </span>
                            {owner ? staffPrimaryLabel(owner) : "—"}
                          </div>
                          <LeadQuickActions leadId={r.id} />
                          <LeadTemperatureQuickSet leadId={r.id} value={r.lead_temperature ?? null} />
                        </>
                      )}
                    </div>
                    <div className={`flex min-w-0 flex-col md:items-end ${compact ? "gap-1" : "gap-2"}`}>
                      <CompactContactLines dense={compact} phoneDisplay={phone ? formatPhoneForDisplay(phone) : null} email={email || null} />
                      <LeadActionButtonRow compact={compact} leadId={r.id} phone={phone} keypadHref={keypadHref} smsHref={smsHref} />
                    </div>
                    <div
                      className={`text-right tabular-nums text-slate-500 ${compact ? "text-[10px] leading-tight md:max-w-none" : "whitespace-nowrap text-[11px] md:pt-1"}`}
                    >
                      {(() => {
                        const c = relativeCreatedParts(r.created_at);
                        return <span title={c.full}>{compact ? c.short : c.full}</span>;
                      })()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
      {bulkModal}
    </div>
  );
}
