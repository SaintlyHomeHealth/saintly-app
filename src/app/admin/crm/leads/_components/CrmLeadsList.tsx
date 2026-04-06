"use client";

import Link from "next/link";
import { Mail, Phone } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { bulkSoftDeleteLeads } from "@/app/admin/crm/actions";
import { LeadDeleteButton } from "@/app/admin/crm/leads/_components/LeadDeleteButton";
import { formatLeadLastContactSummary } from "@/lib/crm/lead-contact-outcome";
import { formatLeadNextActionLabel } from "@/lib/crm/lead-follow-up-options";
import { formatLeadPipelineStatusLabel } from "@/lib/crm/lead-pipeline-status";
import { formatLeadSourceLabel } from "@/lib/crm/lead-source-options";
import { parseEmploymentApplicationMeta } from "@/lib/crm/lead-employment-meta";
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

const leadRowHoverCls =
  "hover:z-[1] hover:rounded-xl hover:border-slate-100 hover:bg-slate-50/90 hover:shadow-md hover:shadow-slate-200/60";

function LeadTypeBadge({ leadType }: { leadType: string | null }) {
  if (leadType === "employee") {
    return (
      <span className="inline-flex w-fit rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-900 ring-1 ring-indigo-200/70">
        Employee
      </span>
    );
  }
  return (
    <span className="inline-flex w-fit rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-900 ring-1 ring-emerald-200/70">
      Patient
    </span>
  );
}

function LeadContactBlock({
  name,
  roleLine,
  phoneDisplay,
  email,
  detailHref,
  showName = true,
}: {
  name: string;
  roleLine: string | null;
  phoneDisplay: string | null;
  email: string | null;
  detailHref: string;
  showName?: boolean;
}) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      {showName ? (
        <Link href={detailHref} className="font-bold leading-snug text-slate-900 hover:text-sky-800 hover:underline">
          {name}
        </Link>
      ) : null}
      {roleLine ? <p className="text-[11px] leading-snug text-slate-500">{roleLine}</p> : null}
      {phoneDisplay ? (
        <div className="flex items-center gap-1.5 text-xs text-slate-700">
          <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
          <span className="tabular-nums">{phoneDisplay}</span>
        </div>
      ) : null}
      {email ? (
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-slate-700">
          <Mail className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
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
  const btn =
    "inline-flex items-center justify-center rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold shadow-sm transition hover:shadow-md";
  const disabled = "cursor-not-allowed border-slate-100 bg-slate-50 text-slate-400 opacity-60 shadow-none hover:shadow-none";

  return (
    <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 md:ml-auto md:max-w-[14rem]">
      {keypadHref ? (
        <Link href={keypadHref} prefetch={false} className={`${btn} border-emerald-200 bg-white text-emerald-900 hover:border-emerald-300 hover:bg-emerald-50`}>
          Call
        </Link>
      ) : (
        <span className={`${btn} ${disabled}`} title={phone ? undefined : "No dialable phone"}>
          Call
        </span>
      )}
      {smsHref ? (
        <Link href={smsHref} prefetch={false} className={`${btn} border-sky-200 bg-white text-sky-900 hover:border-sky-300 hover:bg-sky-50`}>
          Text
        </Link>
      ) : (
        <span className={`${btn} ${disabled}`} title={phone ? undefined : "No SMS"}>
          Text
        </span>
      )}
      <Link href={detailHref} className={`${btn} border-slate-200 bg-white text-slate-800 hover:border-slate-300 hover:bg-slate-50`}>
        View
      </Link>
      <LeadDeleteButton leadId={leadId} variant="tableInline" />
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
};

export function CrmLeadsList({ initialList, employeeOnlyView, staffOptions }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState(initialList);
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

  return (
    <div className="space-y-3">
      {bulkBar}
      <div className="overflow-x-auto rounded-[28px] border border-slate-200 bg-white shadow-sm">
        {employeeOnlyView ? (
          <div className="min-w-[1040px] text-sm">
            <div className="hidden gap-x-6 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600 md:grid md:grid-cols-[2.5rem_minmax(11rem,1fr)_minmax(15rem,1.35fr)_minmax(16rem,1.5fr)_minmax(5.5rem,auto)]">
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
              <div>Applicant pipeline</div>
              <div className="text-right">Contact &amp; actions</div>
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
                const nextActionLabel = formatLeadNextActionLabel(r.next_action);
                const nextHiring =
                  nextActionLabel !== "—" ? nextActionLabel : (r.referral_source ?? "").trim() || "—";
                const detailHref = `/admin/crm/leads/${r.id}`;
                const roleLine = [role !== "—" ? role : null, exp !== "—" ? exp : null].filter(Boolean).join(" · ") || null;

                return (
                  <div
                    key={r.id}
                    className={`grid grid-cols-1 gap-x-6 gap-y-4 border-b border-slate-100 px-4 py-4 transition-all last:border-0 md:grid-cols-[2.5rem_minmax(11rem,1fr)_minmax(15rem,1.35fr)_minmax(16rem,1.5fr)_minmax(5.5rem,auto)] md:items-center ${leadRowHoverCls}`}
                  >
                    <div className="flex items-start justify-center pt-0.5 md:items-center md:self-center md:pt-0">
                      <input
                        type="checkbox"
                        className={checkboxCls}
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select lead ${displayName}`}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Link href={detailHref} className="block font-bold leading-snug text-slate-900 hover:text-sky-800 hover:underline">
                        {displayName}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2">
                        <LeadTypeBadge leadType={r.lead_type} />
                        <span className="text-xs text-slate-600">{formatLeadSourceLabel(r.source)}</span>
                      </div>
                    </div>
                    <div className="min-w-0 space-y-1.5 text-xs leading-relaxed text-slate-700">
                      <div>
                        <span className="text-slate-500">Status</span> · {formatLeadPipelineStatusLabel(r.status)}
                      </div>
                      <div>
                        <span className="text-slate-500">Owner</span> · {owner ? staffPrimaryLabel(owner) : "—"}
                      </div>
                      <div>
                        <span className="text-slate-500">Channel</span> · {(r.referral_source ?? "").trim() || "—"}
                      </div>
                      <div>
                        <span className="text-slate-500">Role</span> · {role}
                      </div>
                      <div>
                        <span className="text-slate-500">Experience</span> · {exp}
                      </div>
                      <div>
                        <span className="text-slate-500">Next hiring</span> · {nextHiring}
                      </div>
                      <div>
                        <span className="text-slate-500">Last contact</span> ·{" "}
                        {formatLeadLastContactSummary(r.last_contact_at, r.last_outcome)}
                      </div>
                      <div>
                        <span className="text-slate-500">Follow-up</span> · {formatFollowUpDate(r.follow_up_date)}
                      </div>
                    </div>
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <LeadContactBlock
                        name={displayName}
                        showName={false}
                        roleLine={roleLine}
                        phoneDisplay={phone ? formatPhoneForDisplay(phone) : null}
                        email={email || null}
                        detailHref={detailHref}
                      />
                      <LeadActionButtonRow leadId={r.id} phone={phone} keypadHref={keypadHref} smsHref={smsHref} />
                    </div>
                    <div className="whitespace-nowrap text-right text-xs tabular-nums text-slate-600 md:self-center">
                      {new Date(r.created_at).toLocaleString()}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          <div className="min-w-[1140px] text-sm">
            <div className="hidden gap-x-6 border-b border-slate-100 bg-slate-50 px-4 py-3 text-xs font-semibold text-slate-600 md:grid md:grid-cols-[2.5rem_minmax(11rem,1fr)_minmax(12rem,1.1fr)_minmax(11rem,1fr)_minmax(17rem,1.4fr)_minmax(5.5rem,auto)]">
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
              <div>Intake &amp; payer</div>
              <div className="text-right">Contact &amp; actions</div>
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
                const roleLine = isEmployee ? [role || null, exp || null].filter(Boolean).join(" · ") || null : null;

                return (
                  <div
                    key={r.id}
                    className={`grid grid-cols-1 gap-x-6 gap-y-4 border-b border-slate-100 px-4 py-4 transition-all last:border-0 md:grid-cols-[2.5rem_minmax(11rem,1fr)_minmax(12rem,1.1fr)_minmax(11rem,1fr)_minmax(17rem,1.4fr)_minmax(5.5rem,auto)] md:items-center ${leadRowHoverCls}`}
                  >
                    <div className="flex items-start justify-center pt-0.5 md:items-center md:self-center md:pt-0">
                      <input
                        type="checkbox"
                        className={checkboxCls}
                        checked={selected.has(r.id)}
                        onChange={() => toggleOne(r.id)}
                        aria-label={`Select lead ${displayName}`}
                      />
                    </div>
                    <div className="min-w-0 space-y-2">
                      <Link href={detailHref} className="block font-bold leading-snug text-slate-900 hover:text-sky-800 hover:underline">
                        {displayName}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2">
                        <LeadTypeBadge leadType={r.lead_type} />
                        <span className="text-xs text-slate-600">{formatLeadSourceLabel(r.source)}</span>
                      </div>
                    </div>
                    <div className="min-w-0 space-y-1.5 text-xs leading-relaxed text-slate-700">
                      <div>
                        <span className="text-slate-500">Status</span> · {formatLeadPipelineStatusLabel(r.status)}
                      </div>
                      <div>
                        <span className="text-slate-500">Owner</span> · {owner ? staffPrimaryLabel(owner) : "—"}
                      </div>
                      <div>
                        <span className="text-slate-500">Next action</span> · {formatLeadNextActionLabel(r.next_action)}
                      </div>
                      <div>
                        <span className="text-slate-500">Follow-up</span> · {formatFollowUpDate(r.follow_up_date)}
                      </div>
                      <div>
                        <span className="text-slate-500">Last contact</span> ·{" "}
                        {formatLeadLastContactSummary(r.last_contact_at, r.last_outcome)}
                      </div>
                    </div>
                    <div className="min-w-0 text-xs leading-relaxed text-slate-700">
                      {isEmployee ? (
                        <div className="rounded-lg border border-indigo-100 bg-indigo-50/40 p-3">
                          <div className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">Applicant</div>
                          <div className="mt-1.5">
                            <span className="text-slate-500">Role</span> · {role || "—"}
                          </div>
                          {exp ? (
                            <div className="mt-0.5">
                              <span className="text-slate-500">Experience</span> · {exp}
                            </div>
                          ) : null}
                          {(r.referral_source ?? "").trim() ? (
                            <div className="mt-0.5">
                              <span className="text-slate-500">Channel</span> · {(r.referral_source ?? "").trim()}
                            </div>
                          ) : null}
                          {resume ? (
                            <div className="mt-2">
                              <a
                                href={resume}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] font-semibold text-sky-800 underline-offset-2 hover:underline"
                              >
                                Resume link
                              </a>
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-1.5">
                          <div>
                            <span className="text-slate-500">Intake</span> · {r.intake_status ?? "—"}
                          </div>
                          <div>
                            <span className="text-slate-500">Payer type</span> · {r.payer_type ?? "—"}
                          </div>
                          <div className="break-words">
                            <span className="text-slate-500">Payer</span> · {trunc(r.payer_name, 40)}
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                      <LeadContactBlock
                        name={displayName}
                        showName={false}
                        roleLine={roleLine}
                        phoneDisplay={phone ? formatPhoneForDisplay(phone) : null}
                        email={email || null}
                        detailHref={detailHref}
                      />
                      <LeadActionButtonRow leadId={r.id} phone={phone} keypadHref={keypadHref} smsHref={smsHref} />
                    </div>
                    <div className="whitespace-nowrap text-right text-xs tabular-nums text-slate-600 md:self-center">
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
