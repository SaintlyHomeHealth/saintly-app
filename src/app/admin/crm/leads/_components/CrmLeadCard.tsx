"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  markLeadDeadFromList,
  quickMarkLeadLeftVoicemail,
  quickMarkLeadNoResponse,
  quickMarkLeadSpoke,
  quickSetLeadFollowUp,
  quickSetLeadTemperature,
} from "@/app/admin/crm/actions";
import { LeadDeleteButton } from "@/app/admin/crm/leads/_components/LeadDeleteButton";
import {
  LeadListRowCallAttempts,
  LeadListRowQuickNote,
} from "@/app/admin/crm/leads/_components/LeadListRowQuickNoteAndAttempts";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";
import {
  formatAppDate,
  formatAppDateTime,
  parseAppDateTimeInputToUtcIso,
} from "@/lib/datetime/app-timezone";
import {
  contactStageBadgeLabel,
  followUpUrgency,
  lastContactHumanLine,
  lastContactToneClass,
  leadRowCardClass,
  shouldShowPipelineStatusOnLeadRow,
} from "@/lib/crm/crm-leads-list-visual";
import {
  contactDisplayName,
  contactEmail,
  formatFollowUpListLabel,
  normalizeContact,
  staffPrimaryLabel,
  type CrmLeadRow,
} from "@/lib/crm/crm-leads-table-helpers";
import { buildAdminCrmLeadDetailHref } from "@/lib/crm/admin-crm-leads-list-url";
import { parseEmploymentApplicationMeta } from "@/lib/crm/lead-employment-meta";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import { LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION } from "@/lib/crm/lead-holds";
import { formatLeadPipelineStatusLabel } from "@/lib/crm/lead-pipeline-status";
import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";
import type { LeadTemperature } from "@/lib/crm/lead-temperature";
import { leadTemperatureLabel, normalizeLeadTemperature } from "@/lib/crm/lead-temperature";
import {
  formatProducedBySalesAgentLabel,
  isSalesAgentProducedLead,
} from "@/lib/crm/sales-agent-produced-by";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  buildWorkspaceInboxLeadSmsHref,
  buildWorkspaceKeypadCallHref,
  buildWorkspaceSmsToContactHref,
  pickOutboundE164ForDial,
} from "@/lib/workspace-phone/launch-urls";

type StaffOpt = {
  user_id: string;
  email: string | null;
  role: string;
  full_name: string | null;
};

type Props = {
  row: CrmLeadRow;
  employeeOnlyView: boolean;
  compact?: boolean;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  todayIso: string;
  leadsListContextHref: string;
  staffById: Map<string, StaffOpt>;
  producedByAgentNameByUserId: Record<string, string>;
  smsConversationIdByContactId: Record<string, string>;
  onIncrementCommitted: (leadId: string, next: number) => void;
  onCountCommitted: (leadId: string, next: number) => void;
  onToast: (t: { type: "ok" | "err"; message: string }) => void;
};

const cardCls =
  "group/lead overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-sm shadow-slate-200/40 transition hover:border-sky-200/80 hover:shadow-md hover:shadow-sky-100/50";

const pillBase =
  "inline-flex max-w-full shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1";

const metaCls = "text-xs text-slate-600";

// Bottom action-bar buttons — mirrors the Recruiting engagement bar styling.
const barBtnBase =
  "inline-flex h-7 items-center justify-center rounded-full border px-2.5 text-[11px] font-semibold transition disabled:opacity-50";

function barBtnClass(tone: "primary" | "rose" | "ghost"): string {
  if (tone === "primary") return `${barBtnBase} border-sky-300 bg-sky-50 text-sky-900 hover:bg-sky-100`;
  if (tone === "rose") return `${barBtnBase} border-rose-200 bg-white text-rose-800 hover:bg-rose-50`;
  return `${barBtnBase} border-slate-200 bg-white text-slate-700 hover:bg-slate-50`;
}

// Large top-right action buttons — mirrors RecruitingLeadActionsMenu.
const openBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-sky-600 bg-sky-600 px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 whitespace-nowrap";
const callBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50/90 px-3 text-xs font-semibold text-emerald-900 shadow-sm transition hover:border-emerald-300 hover:bg-emerald-50 whitespace-nowrap";
const textBtnCls =
  "inline-flex h-8 shrink-0 items-center justify-center rounded-lg border border-sky-200 bg-sky-50/90 px-3 text-xs font-semibold text-sky-900 shadow-sm transition hover:border-sky-300 hover:bg-sky-50 whitespace-nowrap";
const disabledBtnCls =
  "inline-flex h-8 shrink-0 cursor-not-allowed items-center justify-center rounded-lg border border-slate-100 bg-slate-50 px-3 text-xs font-semibold text-slate-400 whitespace-nowrap";
const kebabBtnCls =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:border-slate-300 hover:bg-slate-50";

const TEMP_OPTIONS: { value: LeadTemperature; label: string }[] = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cool", label: "Cool" },
  { value: "dead", label: "Dead" },
];

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0] ?? ""}${parts[parts.length - 1]![0] ?? ""}`.toUpperCase();
}

function relativeCreated(iso: string): { short: string; full: string } {
  const d = new Date(iso);
  const full = Number.isNaN(d.getTime()) ? String(iso) : formatAppDateTime(d);
  if (Number.isNaN(d.getTime())) return { short: "—", full };
  return {
    short: formatAppDate(d, "—", { month: "short", day: "numeric", year: "numeric" }),
    full,
  };
}

function leadTypeBadge(leadType: string | null, status: string | null) {
  if (leadType === "employee") {
    return <span className={`${pillBase} bg-indigo-50 text-indigo-900 ring-indigo-200/70`}>Employee</span>;
  }
  const st = (status ?? "").trim().toLowerCase();
  if (st === "converted") {
    return <span className={`${pillBase} bg-emerald-50 text-emerald-900 ring-emerald-200/70`}>Patient</span>;
  }
  return <span className={`${pillBase} bg-sky-50 text-sky-900 ring-sky-200/70`}>Lead</span>;
}

function priorityBadgeClass(t: LeadTemperature): string {
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
  if (fu === "overdue") return "font-semibold text-rose-800";
  if (fu === "today") return "font-semibold text-amber-900";
  return "text-slate-700";
}

function leadCreditDisplay(
  r: CrmLeadRow,
  producedByAgentNameByUserId: Record<string, string>,
  owner: StaffOpt | undefined
): { label: string; value: string } {
  if (
    isSalesAgentProducedLead({
      source: r.source,
      producedBySalesAgentId: r.produced_by_sales_agent_id,
      ownershipLocked: r.ownership_locked,
    })
  ) {
    const uid = (r.produced_by_sales_agent_id ?? "").trim();
    const name = uid ? producedByAgentNameByUserId[uid] : null;
    return { label: "Produced by", value: formatProducedBySalesAgentLabel(name) };
  }
  return { label: "Owner", value: owner ? staffPrimaryLabel(owner) : "—" };
}

/** Phoenix 7pm on today + dayOffset, as a UTC ISO instant (matches recruiting presets). */
function followUpPresetIso(dayOffset: number): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === "year")?.value ?? 1970);
  const m = Number(parts.find((p) => p.type === "month")?.value ?? 1);
  const d = Number(parts.find((p) => p.type === "day")?.value ?? 1);
  const dt = new Date(Date.UTC(y, m - 1, d + dayOffset, 19, 0, 0));
  return dt.toISOString();
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <p className="min-w-0 text-xs text-slate-600">
      <span className="font-medium text-slate-700">{label}:</span> {children}
    </p>
  );
}

export function CrmLeadCard({
  row,
  employeeOnlyView,
  compact,
  selected,
  onToggleSelect,
  todayIso,
  leadsListContextHref,
  staffById,
  producedByAgentNameByUserId,
  smsConversationIdByContactId,
  onIncrementCommitted,
  onCountCommitted,
  onToast,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpWhen, setFollowUpWhen] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const contact = normalizeContact(row.contacts);
  const displayName = contactDisplayName(contact, { unknownLabel: "Unknown patient" });
  const phone = (contact?.primary_phone ?? "").trim();
  const email = contactEmail(contact);
  const owner = row.owner_user_id ? staffById.get(row.owner_user_id) : undefined;
  const credit = leadCreditDisplay(row, producedByAgentNameByUserId, owner);
  const cid = typeof row.contact_id === "string" ? row.contact_id.trim() : "";
  const dialE164 = pickOutboundE164ForDial(phone);
  const keypadHref = dialE164
    ? buildWorkspaceKeypadCallHref({ dial: dialE164, leadId: row.id, contactId: cid, contextName: displayName })
    : null;
  const existingConv = cid ? smsConversationIdByContactId[cid] : undefined;
  const smsHref =
    cid && dialE164
      ? existingConv
        ? buildWorkspaceInboxLeadSmsHref({ conversationId: existingConv, leadId: row.id })
        : buildWorkspaceSmsToContactHref({ contactId: cid, leadId: row.id })
      : null;
  const detailHref = buildAdminCrmLeadDetailHref(row.id, leadsListContextHref);

  const isEmployee = row.lead_type === "employee";
  const emp = parseEmploymentApplicationMeta(row.external_source_metadata);
  const role = (emp?.position ?? "").trim();
  const exp = (emp?.years_experience ?? "").trim();
  const resume = (emp?.resume_url ?? "").trim();
  const showEmployeeMeta = employeeOnlyView || isEmployee;

  const contactStage = contactStageBadgeLabel(row);
  const fu = followUpUrgency(row.follow_up_date, todayIso);
  const lcHuman = lastContactHumanLine(row.last_contact_at, row.last_outcome, todayIso, row.status);
  const nextActionLabel = formatLeadNextActionLabel(row.next_action);
  const temperature = normalizeLeadTemperature(row.lead_temperature ?? null);
  const payer = (row.primary_payer_name ?? row.payer_name ?? "").trim();
  const serviceArea =
    (row.service_disciplines && row.service_disciplines.length > 0
      ? row.service_disciplines.join(", ")
      : row.service_type ?? "") || "";
  const created = relativeCreated(row.created_at);

  function runQuick(
    kind: "spoke" | "voicemail" | "no_response" | "dead",
    action: (fd: FormData) => Promise<{ ok: boolean }>,
    okMsg: string
  ) {
    setBusy(kind);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("leadId", row.id);
      const r = await action(fd);
      setBusy(null);
      if (r.ok) {
        onToast({ type: "ok", message: okMsg });
        router.refresh();
      } else {
        onToast({ type: "err", message: "Could not update lead. Please try again." });
      }
    });
  }

  function setTemperature(next: LeadTemperature) {
    setBusy(`temp:${next}`);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("leadId", row.id);
      fd.set("lead_temperature", next);
      const r = await quickSetLeadTemperature(fd);
      setBusy(null);
      if (r.ok) router.refresh();
      else onToast({ type: "err", message: "Could not set priority." });
    });
  }

  function saveFollowUp(iso: string) {
    setBusy("follow_up");
    startTransition(async () => {
      const fd = new FormData();
      fd.set("leadId", row.id);
      fd.set("follow_up_at_iso", iso);
      const r = await quickSetLeadFollowUp(fd);
      setBusy(null);
      if (r.ok) {
        setFollowUpOpen(false);
        setFollowUpWhen("");
        onToast({ type: "ok", message: "Follow-up set" });
        router.refresh();
      } else {
        onToast({ type: "err", message: "Could not set follow-up." });
      }
    });
  }

  return (
    <article className={`${cardCls} ${leadRowCardClass(row, fu)}`}>
      <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,0.85fr)_auto] lg:items-start lg:gap-5">
        {/* LEFT — select + avatar + name + badges + created */}
        <div className="flex min-w-0 items-start gap-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggleSelect(row.id)}
            aria-label={`Select lead ${displayName}`}
            className="mt-1.5 h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500/30"
          />
          <span className="hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-sky-100 to-cyan-100 text-sm font-bold text-sky-800 ring-1 ring-sky-200/60 sm:flex">
            {initialsFromName(displayName)}
          </span>
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              {detailHref ? (
                <Link
                  href={detailHref}
                  className="truncate text-base font-semibold text-slate-900 transition hover:text-sky-800"
                >
                  {displayName}
                </Link>
              ) : (
                <span className="truncate text-base font-semibold text-rose-800" title="Invalid lead ID">
                  {displayName}
                </span>
              )}
              <span className={`${pillBase} ${contactStage.badgeClass}`} title={contactStage.label}>
                {contactStage.label}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {leadTypeBadge(row.lead_type, row.status)}
              <span className={`${pillBase} bg-slate-100 text-slate-700 ring-slate-200/80`}>
                {formatLeadSourceLabel(row.source)}
              </span>
              {shouldShowPipelineStatusOnLeadRow(row.status) ? (
                <span className="text-[11px] text-slate-500">{formatLeadPipelineStatusLabel(row.status)}</span>
              ) : null}
            </div>
            {!isEmployee && row.waiting_on_doctors_orders === true ? (
              <span
                className={`${pillBase} bg-rose-600 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-white shadow-md ring-2 ring-rose-300`}
                title="Unsigned physician orders — do not schedule"
              >
                WAITING ON DOCTOR&apos;S ORDERS
              </span>
            ) : null}
            {!isEmployee && row.waiting_on_insurance_verification === true ? (
              <span
                className={`${pillBase} border border-amber-600/90 bg-amber-200/90 px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide text-amber-950 shadow-sm ring-2 ring-amber-400/80`}
                title="Insurance eligibility or benefits verification pending"
              >
                {LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION.badgeText}
              </span>
            ) : null}
            <p className={metaCls} suppressHydrationWarning title={created.full}>
              Added {created.short}
            </p>
          </div>
        </div>

        {/* MIDDLE — contact details */}
        <div className="grid min-w-0 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
          <DetailRow label="Phone">{phone ? formatPhoneForDisplay(phone) : "—"}</DetailRow>
          <p className="line-clamp-1 min-w-0 break-all text-xs text-slate-600">
            <span className="font-medium text-slate-700">Email:</span> {email || "—"}
          </p>
          <DetailRow label="Payer">{payer || "—"}</DetailRow>
          {serviceArea ? <DetailRow label="Service">{serviceArea}</DetailRow> : null}
          <DetailRow label={credit.label}>{credit.value}</DetailRow>
          {showEmployeeMeta && (role || exp || resume) ? (
            <p className="flex flex-wrap items-baseline gap-x-1 text-xs text-slate-600">
              {role ? <span className="font-medium">{role}</span> : null}
              {exp ? <span>· {exp}</span> : null}
              {resume ? (
                <>
                  ·{" "}
                  <a
                    href={resume}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-semibold text-sky-800 underline-offset-2 hover:underline"
                  >
                    Resume
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
        </div>

        {/* RIGHT — follow-up / last / attempts / priority */}
        <div className="min-w-0 space-y-1.5">
          <DetailRow label="Next follow-up">
            <span className={followUpValueClass(fu)}>
              {formatFollowUpListLabel(row.follow_up_date, row.follow_up_at)}
            </span>
          </DetailRow>
          <DetailRow label="Last contact">
            <span className={lastContactToneClass(lcHuman.tone)}>{lcHuman.line}</span>
          </DetailRow>
          {nextActionLabel !== "—" ? <DetailRow label="Next">{nextActionLabel}</DetailRow> : null}
          <DetailRow label="Attempts">{Math.max(0, row.call_attempt_count ?? 0)}</DetailRow>
          <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
            <span className="text-[11px] font-medium text-slate-500">Priority:</span>
            {temperature ? (
              <span className={`${pillBase} ${priorityBadgeClass(temperature)}`}>
                {leadTemperatureLabel(temperature)}
              </span>
            ) : (
              <span className="text-[11px] text-slate-400">—</span>
            )}
          </div>
        </div>

        {/* TOP-RIGHT ACTIONS */}
        <div className="flex flex-wrap items-center gap-1.5 lg:justify-self-end">
          {keypadHref ? (
            <Link href={keypadHref} className={callBtnCls}>
              Call
            </Link>
          ) : (
            <span className={disabledBtnCls} title="No dialable phone">
              Call
            </span>
          )}
          {smsHref ? (
            <Link href={smsHref} className={textBtnCls}>
              Text
            </Link>
          ) : (
            <span className={disabledBtnCls} title="No SMS">
              Text
            </span>
          )}
          {detailHref ? (
            <Link href={detailHref} className={openBtnCls}>
              Open
            </Link>
          ) : null}
          <div ref={menuRef} className="relative">
            <button
              type="button"
              className={kebabBtnCls}
              aria-label="More actions"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
                <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Zm0 5.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3Z" />
              </svg>
            </button>
            {menuOpen ? (
              <div
                className="absolute right-0 top-full z-20 mt-1 min-w-[10rem] overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-200/60"
                role="menu"
              >
                {detailHref ? (
                  <Link
                    href={detailHref}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    Open lead
                  </Link>
                ) : null}
                <LeadDeleteButton leadId={row.id} variant="menu" onRequestOpen={() => setMenuOpen(false)} />
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* BOTTOM ACTION BAR */}
      <div className="space-y-2 border-t border-slate-100 bg-gradient-to-r from-slate-50/80 via-white to-sky-50/30 px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            disabled={pending}
            onClick={() => runQuick("spoke", quickMarkLeadSpoke, "Logged: Spoke")}
            className={barBtnClass("primary")}
            title="Log last contact as Spoke (call)"
          >
            {busy === "spoke" ? "…" : "Spoke"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => runQuick("voicemail", quickMarkLeadLeftVoicemail, "Logged: Left voicemail")}
            className={barBtnClass("ghost")}
            title="Log last contact as Left voicemail (call)"
          >
            {busy === "voicemail" ? "…" : "Left VM"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => runQuick("no_response", quickMarkLeadNoResponse, "Logged: No response")}
            className={barBtnClass("ghost")}
            title="Manual: no response after multiple attempts"
          >
            {busy === "no_response" ? "…" : "No response"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => runQuick("dead", markLeadDeadFromList, "Marked dead")}
            className={barBtnClass("rose")}
            title="Mark this lead as dead"
          >
            {busy === "dead" ? "…" : "Dead"}
          </button>

          <LeadListRowCallAttempts
            leadId={row.id}
            row={row}
            compact={compact}
            onIncrementCommitted={onIncrementCommitted}
            onCountCommitted={onCountCommitted}
            onToast={onToast}
          />
          <LeadListRowQuickNote leadId={row.id} compact={compact} onToast={onToast} />

          <button
            type="button"
            disabled={pending}
            onClick={() => {
              setFollowUpWhen("");
              setFollowUpOpen(true);
            }}
            className={barBtnClass("ghost")}
          >
            Set follow-up
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Lead priority">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Priority</span>
          {TEMP_OPTIONS.map((o) => {
            const active = temperature === o.value;
            return (
              <button
                key={o.value}
                type="button"
                disabled={pending}
                onClick={() => setTemperature(o.value)}
                title={`Set priority: ${o.label}`}
                className={
                  active
                    ? `${barBtnBase} border-transparent ${priorityBadgeClass(o.value)} ring-1`
                    : `${barBtnBase} border-slate-200 bg-white text-slate-600 hover:bg-slate-50`
                }
              >
                {busy === `temp:${o.value}` ? "…" : o.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* FOOTER */}
      <div className="flex items-center justify-end border-t border-slate-100/80 px-4 py-2">
        {detailHref ? (
          <Link
            href={detailHref}
            className="inline-flex items-center gap-1 text-xs font-semibold text-sky-800 transition group-hover/lead:gap-1.5 hover:text-sky-900"
          >
            Open lead
            <span aria-hidden>→</span>
          </Link>
        ) : null}
      </div>

      {/* SET FOLLOW-UP MODAL */}
      {followUpOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[20px] border border-slate-200 bg-white p-4 shadow-2xl">
            <h4 className="text-sm font-semibold text-slate-900">Set follow-up</h4>
            <p className="mt-0.5 text-xs text-slate-500">{displayName}</p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {[
                { label: "Today", offset: 0 },
                { label: "Tomorrow", offset: 1 },
                { label: "3 days", offset: 3 },
                { label: "1 week", offset: 7 },
              ].map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={pending}
                  onClick={() => saveFollowUp(followUpPresetIso(preset.offset))}
                  className={barBtnClass("ghost")}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <label className="mt-3 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Custom date &amp; time
              <input
                type="datetime-local"
                value={followUpWhen}
                onChange={(e) => setFollowUpWhen(e.target.value)}
                className={`${crmFilterInputCls} mt-1 w-full text-sm`}
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
                onClick={() => setFollowUpOpen(false)}
                disabled={pending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded-lg border border-sky-600 bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
                disabled={pending || !followUpWhen.trim()}
                onClick={() => {
                  const iso = parseAppDateTimeInputToUtcIso(followUpWhen.trim());
                  if (!iso) {
                    onToast({ type: "err", message: "Pick a valid date and time." });
                    return;
                  }
                  saveFollowUp(iso);
                }}
              >
                {busy === "follow_up" ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </article>
  );
}
