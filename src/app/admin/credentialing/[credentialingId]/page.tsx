import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import {
  markPayerCredentialingDenied,
  patchPayerCredentialingRecord,
  reapplyPayerCredentialing,
  updatePayerCredentialingRecord,
} from "../actions";
import { PayerContactQuickStrip, PayerWorkingContactCard } from "./PayerContactBlocks";
import {
  CredentialingActivitySection,
  CredentialingActivitySectionFallback,
} from "./CredentialingActivitySection";
import {
  CredentialingAttachmentsSection,
  CredentialingAttachmentsSectionFallback,
} from "./CredentialingAttachmentsSection";
import {
  CredentialingChecklistSection,
  CredentialingChecklistSectionFallback,
} from "./CredentialingChecklistSection";
import {
  CONTRACTING_STATUS_LABELS,
  CONTRACTING_STATUS_VALUES,
  CREDENTIALING_PRIORITY_LABELS,
  CREDENTIALING_PRIORITY_VALUES,
  CREDENTIALING_STATUS_LABELS,
  CREDENTIALING_STATUS_VALUES,
  isCredentialingPriority,
} from "@/lib/crm/credentialing-status-options";
import {
  analyzePayerCredentialingAttention,
  CREDENTIALING_ATTENTION_REASON_LABELS,
  type PayerCredentialingListRow,
} from "@/lib/crm/credentialing-command-center";
import {
  computeCredentialingPipelineBlocker,
  computeCredentialingPipelineStage,
  credentialingPipelineBlockerBadgeClass,
  credentialingPipelineStageBadgeClass,
  CREDENTIALING_PIPELINE_BLOCKER_LABELS,
  CREDENTIALING_PIPELINE_STAGE_LABELS,
} from "@/lib/crm/credentialing-pipeline-display";
import { formatCredentialingDateTime } from "@/lib/crm/credentialing-datetime";
import {
  getSimplifiedCredentialingPipelineStepIndex,
  getSimplifiedCredentialingPipelineTargets,
  type SimplifiedCredentialingPipelineStepIndex,
  SIMPLIFIED_CREDENTIALING_PIPELINE_STEPS,
  simplifiedCredentialingPipelineStepButtonClass,
} from "@/lib/crm/credentialing-pipeline-ui";
import { PAYER_DENIAL_REASON_VALUES } from "@/lib/crm/credentialing-denial";
import { PAYER_CREDENTIALING_RECORD_DETAIL_SELECT } from "@/lib/crm/payer-credentialing-record-select";
import { PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES } from "@/lib/crm/payer-credentialing-storage";
import {
  credentialingStaffLabel,
  loadCredentialingStaffAssignees,
  loadCredentialingStaffLabelMap,
} from "@/lib/crm/credentialing-staff-directory";
import type { PayerCredentialingRecordEmail } from "@/lib/crm/payer-credentialing-contact";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PayerCredentialingEmailsFormLazy = dynamic(
  () => import("@/components/credentialing/PayerCredentialingEmailsForm").then((m) => m.PayerCredentialingEmailsForm),
  { loading: () => <p className="text-xs text-slate-500">Loading email editor…</p> }
);

const inp =
  "mt-0.5 w-full max-w-lg rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

const ATTACH_ERR_MESSAGES: Record<string, string> = {
  missing_file: "Choose a file to upload.",
  too_large: `File is too large (max ${Math.round(PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB).`,
  type: "That file type is not allowed. Use PDF, images, Word, Excel, CSV, TXT, or ZIP.",
  record: "Could not verify this payer record.",
  storage: "Storage upload failed. Check the payer-credentialing bucket and policies.",
  db: "Saved to storage but database insert failed; the file may have been removed.",
};

export default async function AdminCredentialingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ credentialingId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const { credentialingId } = await params;
  if (!credentialingId?.trim()) notFound();

  const rawSp = await searchParams;
  const attachErrRaw = typeof rawSp.attach_err === "string" ? rawSp.attach_err.trim() : "";
  const attachErrMsg = attachErrRaw ? ATTACH_ERR_MESSAGES[attachErrRaw] ?? "Upload could not be completed." : "";
  const attachOk = rawSp.attach_ok === "1" || rawSp.attach_ok === "true";

  const supabase = await createServerSupabaseClient();
  const id = credentialingId.trim();

  const { data: row, error } = await supabase
    .from("payer_credentialing_records")
    .select(PAYER_CREDENTIALING_RECORD_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();

  if (error || !row) {
    notFound();
  }

  const [{ data: lastAct }, { data: docStatusRows }, { data: rawEmailRows, error: emailFetchErr }] =
    await Promise.all([
      supabase
        .from("payer_credentialing_activity")
        .select("summary, created_at")
        .eq("credentialing_record_id", id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase.from("payer_credentialing_documents").select("status").eq("credentialing_record_id", id),
      supabase
        .from("payer_credentialing_record_emails")
        .select("id, email, label, is_primary, sort_order")
        .eq("credentialing_record_id", id)
        .order("sort_order", { ascending: true }),
    ]);

  const r = row as Record<string, unknown>;
  const payer_name = String(r.payer_name ?? "");
  const portal_url = typeof r.portal_url === "string" ? r.portal_url : "";
  const portal_username_hint = typeof r.portal_username_hint === "string" ? r.portal_username_hint : "";
  const payer_type = String(r.payer_type ?? "");
  const market_state = String(r.market_state ?? "");
  const credentialing_status = String(r.credentialing_status ?? "in_progress");
  const contracting_status = String(r.contracting_status ?? "pending");
  const denial_reason = typeof r.denial_reason === "string" ? r.denial_reason : "";
  const last_follow_up_at = typeof r.last_follow_up_at === "string" ? r.last_follow_up_at : null;
  const assigned_owner_user_id =
    typeof r.assigned_owner_user_id === "string" ? r.assigned_owner_user_id.trim() : "";
  const next_action = typeof r.next_action === "string" ? r.next_action : "";
  const next_action_due_date =
    typeof r.next_action_due_date === "string" ? r.next_action_due_date.slice(0, 10) : "";
  const priorityRaw = typeof r.priority === "string" ? r.priority : "medium";
  const priority = isCredentialingPriority(priorityRaw) ? priorityRaw : "medium";
  const created_at =
    typeof r.created_at === "string"
      ? r.created_at
      : typeof r.updated_at === "string"
        ? r.updated_at
        : "";

  const docStatusesForAttention = (docStatusRows ?? []) as { status: string | null }[];

  const emailRows: PayerCredentialingRecordEmail[] = !emailFetchErr
    ? ((rawEmailRows ?? []) as PayerCredentialingRecordEmail[])
    : [];

  const staffOptions = await loadCredentialingStaffAssignees();
  const ownerLabelMap = await loadCredentialingStaffLabelMap(assigned_owner_user_id ? [assigned_owner_user_id] : []);
  const ownerLabel = assigned_owner_user_id
    ? ownerLabelMap.get(assigned_owner_user_id) ?? `${assigned_owner_user_id.slice(0, 8)}…`
    : "Unassigned";

  const primaryEmail = typeof r.primary_contact_email === "string" ? r.primary_contact_email.trim() : "";
  const primary_phone_direct = typeof r.primary_contact_phone_direct === "string" ? r.primary_contact_phone_direct : "";
  const primary_fax = typeof r.primary_contact_fax === "string" ? r.primary_contact_fax : "";
  const primary_title = typeof r.primary_contact_title === "string" ? r.primary_contact_title : "";
  const primary_dept = typeof r.primary_contact_department === "string" ? r.primary_contact_department : "";
  const primary_website = typeof r.primary_contact_website === "string" ? r.primary_contact_website : "";
  const primary_contact_notes_field =
    typeof r.primary_contact_notes === "string" ? r.primary_contact_notes : "";
  const primary_last_contacted =
    typeof r.primary_contact_last_contacted_at === "string" ? r.primary_contact_last_contacted_at : "";
  const primary_pref =
    typeof r.primary_contact_preferred_method === "string" ? r.primary_contact_preferred_method.trim() : "";
  const primary_status =
    typeof r.primary_contact_status === "string" &&
    (r.primary_contact_status === "active" || r.primary_contact_status === "inactive")
      ? r.primary_contact_status
      : "active";
  const lastContactedDate =
    primary_last_contacted && primary_last_contacted.length >= 10 ? primary_last_contacted.slice(0, 10) : "";

  const lastSnapshot =
    lastAct && typeof lastAct === "object" && lastAct !== null && "summary" in lastAct && "created_at" in lastAct
      ? {
          summary: String((lastAct as { summary?: string }).summary ?? ""),
          when: formatCredentialingDateTime(String((lastAct as { created_at?: string }).created_at ?? "")),
        }
      : null;

  const emailsForStrip =
    emailRows.length > 0
      ? emailRows.map((e) => ({ email: e.email, label: e.label, is_primary: e.is_primary }))
      : primaryEmail
        ? [{ email: primaryEmail, label: null as string | null, is_primary: true }]
        : [];

  const displayEmailsForCard: PayerCredentialingRecordEmail[] =
    emailRows.length > 0
      ? emailRows
      : primaryEmail
        ? [{ id: "legacy-primary", email: primaryEmail, label: null, is_primary: true }]
        : [];

  const attentionRow: PayerCredentialingListRow = {
    id,
    payer_name,
    payer_type: payer_type.trim() ? payer_type : null,
    market_state: market_state.trim() ? market_state : null,
    credentialing_status,
    contracting_status,
    portal_url: portal_url.trim() ? portal_url : null,
    primary_contact_name: typeof r.primary_contact_name === "string" ? r.primary_contact_name : null,
    primary_contact_phone: typeof r.primary_contact_phone === "string" ? r.primary_contact_phone : null,
    primary_contact_phone_direct: primary_phone_direct.trim() ? primary_phone_direct : null,
    primary_contact_fax: primary_fax.trim() ? primary_fax : null,
    primary_contact_email: typeof r.primary_contact_email === "string" ? r.primary_contact_email : null,
    payer_credentialing_record_emails:
      emailRows.length > 0
        ? emailRows.map((e) => ({ email: e.email }))
        : primaryEmail
          ? [{ email: primaryEmail }]
          : [],
    notes: typeof r.notes === "string" ? r.notes : null,
    last_follow_up_at,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
    created_at,
    assigned_owner_user_id: assigned_owner_user_id || null,
    next_action: next_action.trim() ? next_action : null,
    next_action_due_date: next_action_due_date.trim() ? next_action_due_date : null,
    priority,
    denial_reason: denial_reason.trim() ? denial_reason : null,
    payer_credentialing_documents: docStatusesForAttention.map((d) => ({ status: d.status ?? "" })),
  };

  const attention = analyzePayerCredentialingAttention(attentionRow);
  const attentionReasonText = attention.reasons.map((x) => CREDENTIALING_ATTENTION_REASON_LABELS[x]).join(" · ");
  const pipelineStage = computeCredentialingPipelineStage(attentionRow);
  const pipelineBlocker = computeCredentialingPipelineBlocker(attentionRow);
  const pipelineStep = getSimplifiedCredentialingPipelineStepIndex(credentialing_status, contracting_status);

  const mailtoHref = primaryEmail ? `mailto:${encodeURIComponent(primaryEmail)}` : "";

  const emailRowsForForm =
    emailRows.length > 0
      ? emailRows.map((e) => ({
          email: e.email,
          label: e.label?.trim() ?? "",
          is_primary: e.is_primary,
        }))
      : primaryEmail
        ? [{ email: primaryEmail, label: "", is_primary: true }]
        : [];

  const cardShell =
    "rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60";

  return (
    <div className="scroll-smooth space-y-8 p-6 pb-24">
      <div>
        <Link
          href="/admin/credentialing"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
          Back to credentialing
        </Link>
      </div>

      {attachErrMsg ? (
        <div
          role="alert"
          className="rounded-[20px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 shadow-sm"
        >
          {attachErrMsg}
        </div>
      ) : null}
      {attachOk ? (
        <div className="rounded-[20px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950 shadow-sm">
          Attachment uploaded successfully.
        </div>
      ) : null}
      {emailFetchErr ? (
        <p className="text-sm text-amber-900">
          Contact email list is unavailable until{" "}
          <span className="font-mono text-xs">payer_credentialing_record_emails</span> is migrated.
        </p>
      ) : null}

      <PayerContactQuickStrip
        payerName={payer_name}
        contactName={typeof r.primary_contact_name === "string" ? r.primary_contact_name : ""}
        portalUrl={portal_url}
        portalUsernameHint={portal_username_hint}
        mainPhone={typeof r.primary_contact_phone === "string" ? r.primary_contact_phone : ""}
        directPhone={primary_phone_direct}
        fax={primary_fax}
        emails={emailsForStrip}
        lastSnapshot={lastSnapshot}
      />

      <section id="credentialing-hero" className={`scroll-mt-28 ${cardShell} p-5 sm:p-6`}>
        <p className="text-sm font-semibold text-slate-900">What to do next</p>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payer credentialing</p>
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.65rem]">{payer_name}</h1>
            <p className="font-mono text-[11px] text-slate-400">{credentialingId}</p>
            <div className="flex flex-wrap items-center gap-2">
              <span className={credentialingPipelineStageBadgeClass(pipelineStage)} title="Pipeline stage (derived)">
                {CREDENTIALING_PIPELINE_STAGE_LABELS[pipelineStage]}
              </span>
              <span className={credentialingPipelineBlockerBadgeClass(pipelineBlocker)} title="Blocker (derived)">
                {CREDENTIALING_PIPELINE_BLOCKER_LABELS[pipelineBlocker]}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Raw credentialing / contracting values are unchanged — edit them anytime under{" "}
              <span className="font-semibold text-slate-700">Edit Details</span>.
            </p>
          </div>
          <form action={patchPayerCredentialingRecord} className="w-full min-w-0 shrink-0 lg:max-w-md">
            <input type="hidden" name="id" value={credentialingId} />
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Next action
                <input
                  name="next_action"
                  className={inp}
                  defaultValue={next_action}
                  placeholder="e.g. Call payer re: application status"
                />
              </label>
              <label id="credentialing-hero-follow" className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Due date
                <input name="next_action_due_date" type="date" className={inp} defaultValue={next_action_due_date} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Owner
                <select
                  name="assigned_owner_user_id"
                  className={inp}
                  defaultValue={assigned_owner_user_id || ""}
                >
                  <option value="">Unassigned</option>
                  {staffOptions.map((s) => (
                    <option key={s.user_id} value={s.user_id}>
                      {credentialingStaffLabel(s)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
                Priority
                <select name="priority" className={inp} defaultValue={priority}>
                  {CREDENTIALING_PRIORITY_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {CREDENTIALING_PRIORITY_LABELS[v]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                type="submit"
                className="rounded-xl border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
              >
                Save queue
              </button>
              <span className="text-[11px] text-slate-500">
                Owner: <span className="font-medium text-slate-700">{ownerLabel}</span>
              </span>
            </div>
          </form>
        </div>
      </section>

      <section className={`${cardShell} p-4 sm:p-5`}>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Pipeline</h2>
            <p className="mt-1 text-xs text-slate-500">Click a stage to update credentialing and contracting status.</p>
          </div>
          <p className="text-[11px] font-medium text-slate-500">
            Stepper:{" "}
            <span className="text-slate-800">{SIMPLIFIED_CREDENTIALING_PIPELINE_STEPS[pipelineStep]?.label ?? "—"}</span>
          </p>
        </div>
        <div className="mt-4 flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-1">
          {SIMPLIFIED_CREDENTIALING_PIPELINE_STEPS.map((step, idx) => {
            if (idx === 5) {
              const cls = simplifiedCredentialingPipelineStepButtonClass(idx, pipelineStep, { deniedStepIndex: 5 });
              return (
                <form key={step.label} action={markPayerCredentialingDenied} className="min-w-[88px] flex-1">
                  <input type="hidden" name="credentialing_id" value={credentialingId} />
                  <button
                    type="submit"
                    title="Mark denied (sets follow-up for reapply)"
                    className={`flex w-full min-w-0 flex-col items-center justify-center rounded-xl border px-1.5 py-2.5 text-center text-[10px] font-semibold leading-tight transition sm:text-[11px] ${cls}`}
                  >
                    <span className="hidden sm:inline">{step.label}</span>
                    <span className="sm:hidden">{step.short}</span>
                  </button>
                </form>
              );
            }
            const targets = getSimplifiedCredentialingPipelineTargets(idx as SimplifiedCredentialingPipelineStepIndex);
            const cls = simplifiedCredentialingPipelineStepButtonClass(idx, pipelineStep, { deniedStepIndex: 5 });
            return (
              <form key={step.label} action={patchPayerCredentialingRecord} className="min-w-[88px] flex-1">
                <input type="hidden" name="id" value={credentialingId} />
                <input type="hidden" name="credentialing_status" value={targets.credentialing_status} />
                <input type="hidden" name="contracting_status" value={targets.contracting_status} />
                <button
                  type="submit"
                  title={step.label}
                  className={`flex w-full min-w-0 flex-col items-center justify-center rounded-xl border px-1.5 py-2.5 text-center text-[10px] font-semibold leading-tight transition sm:text-[11px] ${cls}`}
                >
                  <span className="hidden sm:inline">{step.label}</span>
                  <span className="sm:hidden">{step.short}</span>
                </button>
              </form>
            );
          })}
        </div>
        {denial_reason.trim() ? (
          <p className="mt-3 rounded-xl border border-red-200/80 bg-red-50/90 px-3 py-2 text-xs text-red-950">
            <span className="font-semibold">Denial reason: </span>
            {denial_reason}
          </p>
        ) : null}
      </section>

      <div className="flex flex-wrap gap-2">
        <form action={patchPayerCredentialingRecord} className="inline">
          <input type="hidden" name="id" value={credentialingId} />
          <input type="hidden" name="credentialing_status" value="submitted" />
          <button
            type="submit"
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
          >
            Mark Submitted
          </button>
        </form>
        <a
          href="#credentialing-additional-docs"
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
        >
          Upload Document
        </a>
        <a
          href="#credentialing-timeline"
          className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm ring-1 ring-slate-200/80 hover:bg-slate-50"
        >
          Log Activity
        </a>
        {mailtoHref ? (
          <a
            href={mailtoHref}
            className="inline-flex items-center rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-950 shadow-sm hover:bg-sky-100"
          >
            Send Email
          </a>
        ) : (
          <span
            className="inline-flex cursor-not-allowed items-center rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-400"
            title="Add a primary contact email under Edit Details"
          >
            Send Email
          </span>
        )}
        <a
          href="#credentialing-hero-follow"
          className="inline-flex items-center rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-2 text-sm font-semibold text-indigo-950 shadow-sm hover:bg-indigo-100"
        >
          Set due date
        </a>
        {credentialing_status === "denied" ? (
          <form action={reapplyPayerCredentialing} className="inline">
            <input type="hidden" name="credentialing_id" value={credentialingId} />
            <button
              type="submit"
              className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-950 shadow-sm ring-1 ring-emerald-200/80 hover:bg-emerald-100"
            >
              Reapply
            </button>
          </form>
        ) : (
          <form
            action={markPayerCredentialingDenied}
            className="flex flex-col gap-2 rounded-xl border border-red-200/90 bg-red-50/40 p-3 sm:inline-flex sm:flex-row sm:flex-wrap sm:items-end"
          >
            <input type="hidden" name="credentialing_id" value={credentialingId} />
            <div className="flex min-w-[180px] flex-col gap-1">
              <span className="text-[11px] font-semibold text-red-950">Mark Denied</span>
              <select
                name="denial_reason_category"
                className="rounded-lg border border-red-200/90 bg-white px-2 py-1.5 text-sm text-slate-900"
                defaultValue=""
              >
                <option value="">Reason (optional)…</option>
                {PAYER_DENIAL_REASON_VALUES.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex min-w-[160px] flex-col gap-1 text-[11px] font-medium text-red-900/90">
              Other detail
              <input
                name="denial_reason_other"
                placeholder="If “Other”"
                className="rounded-lg border border-red-200/90 bg-white px-2 py-1.5 text-sm text-slate-900"
              />
            </label>
            <button
              type="submit"
              className="rounded-xl border border-red-600 bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-red-700"
            >
              Mark Denied
            </button>
          </form>
        )}
      </div>

      <details className={`${cardShell} bg-white`}>
        <summary className="cursor-pointer list-none px-5 py-4 text-sm font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
          Full contact card
          <span className="ml-2 font-normal text-slate-500">(title, prefs, notes — quick strip above has dial/email)</span>
        </summary>
        <div className="border-t border-slate-100 px-5 pb-5">
          <PayerWorkingContactCard
            contactName={typeof r.primary_contact_name === "string" ? r.primary_contact_name : ""}
            title={primary_title}
            department={primary_dept}
            mainPhone={typeof r.primary_contact_phone === "string" ? r.primary_contact_phone : ""}
            directPhone={primary_phone_direct}
            fax={primary_fax}
            preferred={primary_pref}
            status={primary_status}
            website={primary_website}
            contactNotes={primary_contact_notes_field}
            lastContactedAt={primary_last_contacted}
            portalUrl={portal_url}
            displayEmails={displayEmailsForCard}
          />
        </div>
      </details>

      {attention.needsAttention ? (
        <div
          className="rounded-[20px] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950 shadow-sm"
          role="status"
        >
          <p className="font-bold">Operational attention</p>
          <p className="mt-1 text-xs leading-relaxed text-amber-900">{attentionReasonText}</p>
        </div>
      ) : null}

      <Suspense fallback={<CredentialingActivitySectionFallback />}>
        <CredentialingActivitySection credentialingId={credentialingId} viewerUserId={staff.user_id} />
      </Suspense>

      <Suspense fallback={<CredentialingChecklistSectionFallback />}>
        <CredentialingChecklistSection credentialingId={credentialingId} />
      </Suspense>

      <Suspense fallback={<CredentialingAttachmentsSectionFallback />}>
        <CredentialingAttachmentsSection credentialingId={credentialingId} />
      </Suspense>

      <details id="credentialing-edit-details" className={`group scroll-mt-28 ${cardShell} bg-white`}>
        <summary className="cursor-pointer list-none px-5 py-4 text-base font-semibold text-slate-900 [&::-webkit-details-marker]:hidden">
          <span className="inline-flex items-center gap-2">
            Edit Details
            <span className="text-xs font-normal text-slate-500">(all fields — same save behavior as before)</span>
          </span>
        </summary>
        <div className="border-t border-slate-100 px-5 pb-6 pt-2">
          <form action={updatePayerCredentialingRecord} className="space-y-6">
            <input type="hidden" name="id" value={credentialingId} />
            <h3 className="text-sm font-semibold text-slate-900">Update record</h3>

            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Assigned owner
              <select
                name="assigned_owner_user_id"
                className={inp}
                defaultValue={assigned_owner_user_id || ""}
              >
                <option value="">Unassigned</option>
                {staffOptions.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {credentialingStaffLabel(s)}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Priority
              <select name="priority" className={inp} defaultValue={priority}>
                {CREDENTIALING_PRIORITY_VALUES.map((v) => (
                  <option key={v} value={v}>
                    {CREDENTIALING_PRIORITY_LABELS[v]}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Next action (what to do next)
              <input name="next_action" className={inp} defaultValue={next_action} placeholder="e.g. Call payer re: application" />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Next action due date
              <input name="next_action_due_date" type="date" className={inp} defaultValue={next_action_due_date} />
            </label>

            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Payer name
              <input name="payer_name" className={inp} defaultValue={payer_name} required />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Payer type / plan type
              <input name="payer_type" className={inp} defaultValue={payer_type} />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              State / market
              <input name="market_state" className={inp} defaultValue={market_state} />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Credentialing status
                <select
                  name="credentialing_status"
                  className={inp}
                  defaultValue={credentialing_status || "in_progress"}
                >
                  {CREDENTIALING_STATUS_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {CREDENTIALING_STATUS_LABELS[v]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Contracting status
                <select
                  name="contracting_status"
                  className={inp}
                  defaultValue={contracting_status || "pending"}
                >
                  {CONTRACTING_STATUS_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {CONTRACTING_STATUS_LABELS[v]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div id="record-portal" className="scroll-mt-24 space-y-3 rounded-2xl border border-sky-100/80 bg-sky-50/30 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-sky-900/80">Portal</p>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Portal URL
                <input name="portal_url" type="url" className={inp} defaultValue={portal_url} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Portal username hint (not password)
                <input
                  name="portal_username_hint"
                  className={inp}
                  defaultValue={portal_username_hint}
                />
              </label>
            </div>

            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Primary contact name
              <input
                name="primary_contact_name"
                className={inp}
                defaultValue={String(r.primary_contact_name ?? "")}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Title
                <input name="primary_contact_title" className={inp} defaultValue={primary_title} />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Department
                <input name="primary_contact_department" className={inp} defaultValue={primary_dept} />
              </label>
            </div>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Main phone
              <input
                name="primary_contact_phone"
                className={inp}
                defaultValue={String(r.primary_contact_phone ?? "")}
                autoComplete="tel"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Direct phone
              <input
                name="primary_contact_phone_direct"
                className={inp}
                defaultValue={primary_phone_direct}
                autoComplete="tel"
              />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Fax
              <input name="primary_contact_fax" className={inp} defaultValue={primary_fax} autoComplete="tel" />
            </label>
            <p className="text-xs text-slate-500">
              Display (main):{" "}
              <span className="tabular-nums font-medium text-slate-700">
                {formatPhoneForDisplay(typeof r.primary_contact_phone === "string" ? r.primary_contact_phone : "")}
              </span>
            </p>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Primary contact email (legacy column — synced from email list save)
              <input
                name="primary_contact_email"
                type="email"
                className={inp}
                defaultValue={String(r.primary_contact_email ?? "")}
              />
            </label>

            <PayerCredentialingEmailsFormLazy credentialingId={credentialingId} initialRows={emailRowsForForm} />

            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Contact website (payer site)
              <input name="primary_contact_website" type="url" className={inp} defaultValue={primary_website} />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Last contacted
                <input
                  name="primary_contact_last_contacted_at"
                  type="date"
                  className={inp}
                  defaultValue={lastContactedDate}
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Preferred contact method
                <select name="primary_contact_preferred_method" className={inp} defaultValue={primary_pref || ""}>
                  <option value="">—</option>
                  <option value="phone">Phone</option>
                  <option value="email">Email</option>
                  <option value="fax">Fax</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Contact status
              <select name="primary_contact_status" className={inp} defaultValue={primary_status}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Notes about this contact
              <textarea
                name="primary_contact_notes"
                rows={3}
                className={inp}
                defaultValue={primary_contact_notes_field}
                placeholder="Context: best time to call, escalation path, relationship notes…"
              />
            </label>

            <div className="rounded-2xl border border-slate-100 bg-slate-50/80 p-4">
              <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
                Working notes
                <textarea name="notes" rows={5} className={inp} defaultValue={String(r.notes ?? "")} />
              </label>
              <p className="mt-2 text-[11px] text-slate-500">
                Notes are also copied to the timeline when you save (see Activity). Use “Add timeline entry” above for
                quick dated comments without changing this field.
              </p>
            </div>

            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" name="mark_follow_up_now" value="1" className="rounded border-slate-300" />
              Log follow-up as now (sets <span className="font-mono text-xs">last_follow_up_at</span>)
            </label>

            <button
              type="submit"
              className="rounded-xl border border-sky-600 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm hover:bg-sky-100"
            >
              Save changes
            </button>
          </form>
        </div>
      </details>

      <div className="rounded-[28px] border border-slate-100 bg-slate-50/80 p-4 text-xs text-slate-600">
        <p>
          Record updated:{" "}
          {r.updated_at ? formatCredentialingDateTime(String(r.updated_at)) : "—"}
        </p>
      </div>
    </div>
  );
}
