"use client";

import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  bulkSoftDeleteLeads,
  markLeadDeadFromList,
  quickMarkLeadSpoke,
  quickSetLeadFollowUpTomorrow,
} from "@/app/admin/crm/actions";
import { LeadDeleteButton } from "@/app/admin/crm/leads/_components/LeadDeleteButton";
import { crmListRowHoverCls, crmListScrollOuterCls } from "@/components/admin/crm-admin-list-styles";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";
import { parseEmploymentApplicationMeta } from "@/lib/crm/lead-employment-meta";
import {
  formatStatusPillLabel,
  lastContactHumanLine,
  lastContactToneClass,
  leadRowCardClass,
  pipelineStatusBadgeClass,
  followUpUrgency,
} from "@/lib/crm/crm-leads-list-visual";
import {
  contactDisplayName,
  contactEmail,
  formatFollowUpDate,
  normalizeContact,
  staffPrimaryLabel,
  trunc,
  type CrmLeadRow,
} from "@/lib/crm/crm-leads-table-helpers";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import {
  buildWorkspaceKeypadCallHref,
  buildWorkspaceSmsToContactHref,
  pickOutboundE164ForDial,
} from "@/lib/workspace-phone/launch-urls";

const pillBase = "inline-flex max-w-full shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ring-1";

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

function CompactContactLines({ phoneDisplay, email }: { phoneDisplay: string | null; email: string | null }) {
  if (!phoneDisplay && !email) {
    return <span className="text-[10px] text-slate-400">No phone or email</span>;
  }
  return (
    <div className="flex min-w-0 flex-col gap-0.5 text-[11px] leading-tight text-slate-600">
      {phoneDisplay ? (
        <div className="flex items-center justify-end gap-1 tabular-nums md:justify-start">
          <Phone className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
          <span>{phoneDisplay}</span>
        </div>
      ) : null}
      {email ? (
        <div className="flex min-w-0 items-center justify-end gap-1 md:justify-start">
          <Mail className="h-3 w-3 shrink-0 text-slate-400" aria-hidden />
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
}: {
  leadId: string;
  phone: string;
  keypadHref: string | null;
  smsHref: string | null;
}) {
  const detailHref = `/admin/crm/leads/${leadId}`;
  const primary =
    "inline-flex items-center justify-center rounded-md border px-2 py-1 text-[10px] font-semibold shadow-sm transition hover:shadow";
  const secondary =
    "inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-700 shadow-sm hover:border-slate-300 hover:bg-slate-50";
  const disabled =
    "inline-flex cursor-not-allowed items-center justify-center rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-[10px] font-semibold text-slate-400 opacity-60 shadow-none";

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
      <LeadDeleteButton leadId={leadId} variant="tableInlineSubtle" />
    </div>
  );
}

const checkboxCls = "h-4 w-4 shrink-0 rounded border-slate-300 text-sky-600 focus:ring-sky-500/30";

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
};

const quickBtnCls =
  "inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 disabled:opacity-50";

function LeadQuickActions({ leadId }: { leadId: string }) {
  const router = useRouter();
  return (
    <div className="flex flex-nowrap gap-0.5 pt-0.5">
      <form
        action={async (fd) => {
          const r = await quickMarkLeadSpoke(fd);
          if (r.ok) router.refresh();
        }}
        className="inline"
      >
        <input type="hidden" name="leadId" value={leadId} />
        <button type="submit" className={quickBtnCls} title="Log last contact as Spoke (call)">
          Spoke
        </button>
      </form>
      <form
        action={async (fd) => {
          const r = await quickSetLeadFollowUpTomorrow(fd);
          if (r.ok) router.refresh();
        }}
        className="inline"
      >
        <input type="hidden" name="leadId" value={leadId} />
        <button type="submit" className={quickBtnCls} title="Set follow-up to tomorrow (Central)">
          F/U tomorrow
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
        <button
          type="submit"
          className={`${quickBtnCls} border-rose-200/80 text-rose-800 hover:bg-rose-50/80`}
          title="Mark this lead as dead"
        >
          Dead
        </button>
      </form>
    </div>
  );
}

function followUpValueClass(fu: ReturnType<typeof followUpUrgency>): string {
  if (fu === "overdue") return "font-medium text-rose-800";
  if (fu === "today") return "font-medium text-amber-900";
  return "text-slate-700";
}

export function CrmLeadsList({ initialList, employeeOnlyView, staffOptions, todayIso }: Props) {
  const router = useRouter();
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
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-800 shadow-sm">
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

  const employeeGrid =
    "md:grid-cols-[2rem_minmax(11rem,1.15fr)_minmax(11rem,1fr)_minmax(9.5rem,0.85fr)_minmax(12.5rem,1.1fr)_minmax(4.25rem,auto)]";
  const mixedGrid =
    "md:grid-cols-[2rem_minmax(11rem,1.15fr)_minmax(11rem,1fr)_minmax(9.5rem,0.9fr)_minmax(12.5rem,1.1fr)_minmax(4.25rem,auto)]";

  return (
    <div className="space-y-3">
      {bulkBar}
      <div className={crmListScrollOuterCls}>
        {employeeOnlyView ? (
          <div className="min-w-[1080px] text-sm">
            <div
              className={`hidden gap-x-4 border-b border-slate-100 bg-slate-50/90 px-3 py-2 text-[11px] font-semibold tracking-tight text-slate-600 md:grid ${employeeGrid}`}
            >
              <div className="flex items-center justify-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className={checkboxCls}
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={rowIds.length === 0}
                  aria-label="Select all leads"
                />
              </div>
              <div>Lead</div>
              <div>Pipeline</div>
              <div>Intake</div>
              <div className="text-right">Contact</div>
              <div className="text-right">Created</div>
            </div>
            {rows.length === 0 ? (
              <div className="px-4 py-10 text-slate-500">No employee applicants match these filters.</div>
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
                const smsHref =
                  cid && pickOutboundE164ForDial(phone)
                    ? buildWorkspaceSmsToContactHref({ contactId: cid, leadId: r.id })
                    : null;
                const emp = parseEmploymentApplicationMeta(r.external_source_metadata);
                const role = (emp?.position ?? "").trim() || "—";
                const exp = (emp?.years_experience ?? "").trim() || "—";
                const resume = (emp?.resume_url ?? "").trim();
                const nextActionLabel = formatLeadNextActionLabel(r.next_action);
                const detailHref = `/admin/crm/leads/${r.id}`;
                const fu = followUpUrgency(r.follow_up_date, todayIso);
                const lcHuman = lastContactHumanLine(r.last_contact_at, r.last_outcome, todayIso);

                return (
                  <div
                    key={r.id}
                    className={`grid grid-cols-1 gap-x-3 gap-y-1.5 border-b border-slate-100 px-3 py-2 transition-colors last:border-0 md:items-start ${employeeGrid} ${leadRowCardClass(r, fu)} ${crmListRowHoverCls}`}
                  >
                    <div className="flex items-start justify-center pt-0.5 md:pt-1">
                      <input
                        type="checkbox"
                        className={checkboxCls}
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select lead ${displayName}`}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link
                          href={detailHref}
                          className="min-w-0 text-[15px] font-bold leading-tight text-slate-900 hover:text-sky-800 hover:underline"
                        >
                          {displayName}
                        </Link>
                        <span
                          className={`${pillBase} max-w-[min(100%,14rem)] truncate ${pipelineStatusBadgeClass(r.status)}`}
                          title={formatStatusPillLabel(r.status)}
                        >
                          {formatStatusPillLabel(r.status)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <LeadTypeBadge leadType={r.lead_type} status={r.status} />
                        <span className="text-[10px] text-slate-500">{formatLeadSourceLabel(r.source)}</span>
                      </div>
                    </div>
                    <div className="min-w-0 space-y-1 text-[11px] leading-snug text-slate-600">
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
                        <span className={followUpValueClass(fu)}>{formatFollowUpDate(r.follow_up_date)}</span>
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
                    </div>
                    <div className="min-w-0 text-[11px] leading-snug text-slate-600">
                      <div className="rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1.5">
                        <div className="font-medium text-slate-700">{role}</div>
                        {exp !== "—" ? <div className="text-slate-500">{exp}</div> : null}
                        {(r.referral_source ?? "").trim() ? (
                          <div className="mt-0.5 text-slate-500">{(r.referral_source ?? "").trim()}</div>
                        ) : null}
                        {resume ? (
                          <a
                            href={resume}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-block font-medium text-sky-800 underline-offset-2 hover:underline"
                          >
                            Resume
                          </a>
                        ) : null}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-2 md:items-end">
                      <CompactContactLines phoneDisplay={phone ? formatPhoneForDisplay(phone) : null} email={email || null} />
                      <LeadActionButtonRow leadId={r.id} phone={phone} keypadHref={keypadHref} smsHref={smsHref} />
                    </div>
                    <div className="whitespace-nowrap text-right text-[11px] tabular-nums text-slate-500 md:pt-1">
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="min-w-[1080px] text-sm">
            <div
              className={`hidden gap-x-4 border-b border-slate-100 bg-slate-50/90 px-3 py-2 text-[11px] font-semibold tracking-tight text-slate-600 md:grid ${mixedGrid}`}
            >
              <div className="flex items-center justify-center">
                <input
                  ref={selectAllRef}
                  type="checkbox"
                  className={checkboxCls}
                  checked={allSelected}
                  onChange={toggleAll}
                  disabled={rowIds.length === 0}
                  aria-label="Select all leads"
                />
              </div>
              <div>Lead</div>
              <div>Pipeline</div>
              <div>Intake</div>
              <div className="text-right">Contact</div>
              <div className="text-right">Created</div>
            </div>
            {rows.length === 0 ? (
              <div className="px-4 py-10 text-slate-500">No leads match these filters.</div>
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
                const smsHref =
                  cid && pickOutboundE164ForDial(phone)
                    ? buildWorkspaceSmsToContactHref({ contactId: cid, leadId: r.id })
                    : null;
                const isEmployee = r.lead_type === "employee";
                const emp = parseEmploymentApplicationMeta(r.external_source_metadata);
                const role = (emp?.position ?? "").trim();
                const exp = (emp?.years_experience ?? "").trim();
                const resume = (emp?.resume_url ?? "").trim();
                const detailHref = `/admin/crm/leads/${r.id}`;
                const nextActionLabel = formatLeadNextActionLabel(r.next_action);
                const fu = followUpUrgency(r.follow_up_date, todayIso);
                const lcHuman = lastContactHumanLine(r.last_contact_at, r.last_outcome, todayIso);

                return (
                  <div
                    key={r.id}
                    className={`grid grid-cols-1 gap-x-3 gap-y-1.5 border-b border-slate-100 px-3 py-2 transition-colors last:border-0 md:items-start ${mixedGrid} ${leadRowCardClass(r, fu)} ${crmListRowHoverCls}`}
                  >
                    <div className="flex items-start justify-center pt-0.5 md:pt-1">
                      <input
                        type="checkbox"
                        className={checkboxCls}
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select lead ${displayName}`}
                      />
                    </div>
                    <div className="min-w-0 space-y-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <Link
                          href={detailHref}
                          className="min-w-0 text-[15px] font-bold leading-tight text-slate-900 hover:text-sky-800 hover:underline"
                        >
                          {displayName}
                        </Link>
                        <span
                          className={`${pillBase} max-w-[min(100%,14rem)] truncate ${pipelineStatusBadgeClass(r.status)}`}
                          title={formatStatusPillLabel(r.status)}
                        >
                          {formatStatusPillLabel(r.status)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <LeadTypeBadge leadType={r.lead_type} status={r.status} />
                        <span className="text-[10px] text-slate-500">{formatLeadSourceLabel(r.source)}</span>
                      </div>
                    </div>
                    <div className="min-w-0 space-y-1 text-[11px] leading-snug text-slate-600">
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
                        <span className={followUpValueClass(fu)}>{formatFollowUpDate(r.follow_up_date)}</span>
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
                    </div>
                    <div className="min-w-0 text-[11px] leading-snug text-slate-600">
                      {isEmployee ? (
                        <div className="rounded-md border border-slate-100 bg-slate-50/50 px-2 py-1.5">
                          <div className="font-medium text-slate-700">{role || "—"}</div>
                          {exp ? <div className="text-slate-500">{exp}</div> : null}
                          {(r.referral_source ?? "").trim() ? (
                            <div className="mt-0.5 text-slate-500">{(r.referral_source ?? "").trim()}</div>
                          ) : null}
                          {resume ? (
                            <a
                              href={resume}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="mt-1 inline-block font-medium text-sky-800 underline-offset-2 hover:underline"
                            >
                              Resume
                            </a>
                          ) : null}
                        </div>
                      ) : (
                        <div className="rounded-md border border-slate-100 bg-slate-50/30 px-2 py-1.5 text-slate-600">
                          <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                            <span>{(r.intake_status ?? "").trim() || "—"}</span>
                            {(r.payer_type ?? "").trim() ? (
                              <span className="text-slate-500">· {(r.payer_type ?? "").trim()}</span>
                            ) : null}
                          </div>
                          {(r.payer_name ?? "").trim() ? (
                            <div className="mt-0.5 truncate text-slate-500" title={(r.payer_name ?? "").trim()}>
                              {trunc(r.payer_name, 42)}
                            </div>
                          ) : (
                            <div className="mt-0.5 text-slate-400">Payer not set</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-2 md:items-end">
                      <CompactContactLines phoneDisplay={phone ? formatPhoneForDisplay(phone) : null} email={email || null} />
                      <LeadActionButtonRow leadId={r.id} phone={phone} keypadHref={keypadHref} smsHref={smsHref} />
                    </div>
                    <div className="whitespace-nowrap text-right text-[11px] tabular-nums text-slate-500 md:pt-1">
                      {new Date(r.created_at).toLocaleString()}
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
