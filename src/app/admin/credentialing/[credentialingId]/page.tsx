import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import {
  markPayerCredentialingDenied,
  patchPayerCredentialingRecord,
  reapplyPayerCredentialing,
} from "../actions";
import {
  CredentialingChecklistSection,
  CredentialingChecklistSectionFallback,
} from "./CredentialingChecklistSection";
import {
  CredentialingNotesSection,
  CredentialingNotesSectionFallback,
} from "./CredentialingNotesSection";
import { commandCenterStatusLabel } from "@/lib/crm/credentialing-command-center";
import { formatCredentialingDateTime } from "@/lib/crm/credentialing-datetime";
import { getSimplifiedCredentialingPipelineTargets } from "@/lib/crm/credentialing-pipeline-ui";
import { PAYER_DENIAL_REASON_VALUES } from "@/lib/crm/credentialing-denial";
import { PAYER_CREDENTIALING_RECORD_DETAIL_SELECT } from "@/lib/crm/payer-credentialing-record-select";
import { PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES } from "@/lib/crm/payer-credentialing-storage";
import type { PayerCredentialingRecordEmail } from "@/lib/crm/payer-credentialing-contact";
import { PayerCredentialingEmailsQuick } from "@/components/credentialing/PayerCredentialingEmailsQuick";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const inp =
  "mt-0.5 w-full min-w-0 rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800 sm:max-w-md";

const cardShell =
  "rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60";

const ATTACH_ERR_MESSAGES: Record<string, string> = {
  missing_file: "Choose a file to upload.",
  too_large: `File is too large (max ${Math.round(PAYER_CREDENTIALING_MAX_ATTACHMENT_BYTES / (1024 * 1024))} MB).`,
  type: "That file type is not allowed. Use PDF, images, Word, Excel, CSV, TXT, or ZIP.",
  record: "Could not verify this payer record.",
  storage: "Storage upload failed. Check the payer-credentialing bucket and policies.",
  db: "Saved to storage but database insert failed; the file may have been removed.",
};

function statusBadgeClass(
  s: "Not Started" | "In Progress" | "Submitted" | "Active" | "Denied"
): string {
  switch (s) {
    case "Not Started":
      return "border-slate-200 bg-slate-100 text-slate-900";
    case "In Progress":
      return "border-amber-200 bg-amber-50 text-amber-950";
    case "Submitted":
      return "border-sky-200 bg-sky-50 text-sky-950";
    case "Active":
      return "border-emerald-200 bg-emerald-50 text-emerald-950";
    case "Denied":
      return "border-red-200 bg-red-50 text-red-950";
    default:
      return "border-slate-200 bg-white text-slate-800";
  }
}

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

  const { data: rawEmailRows, error: emailFetchErr } = await supabase
    .from("payer_credentialing_record_emails")
    .select("id, email, label, is_primary, sort_order")
    .eq("credentialing_record_id", id)
    .order("sort_order", { ascending: true });

  const r = row as Record<string, unknown>;
  const payer_name = String(r.payer_name ?? "");
  const credentialing_status = String(r.credentialing_status ?? "in_progress");
  const contracting_status = String(r.contracting_status ?? "pending");
  const denial_reason = typeof r.denial_reason === "string" ? r.denial_reason : "";
  const next_action = typeof r.next_action === "string" ? r.next_action : "";
  const next_action_due_date =
    typeof r.next_action_due_date === "string" ? r.next_action_due_date.slice(0, 10) : "";

  const emailRows: PayerCredentialingRecordEmail[] = !emailFetchErr
    ? ((rawEmailRows ?? []) as PayerCredentialingRecordEmail[])
    : [];

  const primaryEmail = typeof r.primary_contact_email === "string" ? r.primary_contact_email.trim() : "";

  const emailRowsForQuick =
    emailRows.length > 0
      ? emailRows.map((e) => ({
          email: e.email,
          label: e.label?.trim() ?? "",
          is_primary: e.is_primary,
        }))
      : primaryEmail
        ? [{ email: primaryEmail, label: "", is_primary: true }]
        : [];

  const ccStatus = commandCenterStatusLabel(credentialing_status, contracting_status);
  const submittedTargets = getSimplifiedCredentialingPipelineTargets(2);
  const activeTargets = getSimplifiedCredentialingPipelineTargets(4);

  const followUpLabel = next_action_due_date.trim()
    ? (() => {
        try {
          const d = new Date(`${next_action_due_date.trim()}T12:00:00`);
          return Number.isNaN(d.getTime()) ? next_action_due_date : d.toLocaleDateString(undefined, { dateStyle: "medium" });
        } catch {
          return next_action_due_date;
        }
      })()
    : "—";

  return (
    <div className="scroll-smooth space-y-8 p-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/credentialing"
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
          Back to credentialing
        </Link>
        <Link
          href={`/admin/credentialing/${encodeURIComponent(id)}/edit`}
          className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          Edit full record
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

      <header className={`${cardShell} p-5 sm:p-6`}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-[1.65rem]">{payer_name}</h1>
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${statusBadgeClass(ccStatus)}`}
              >
                {ccStatus}
              </span>
            </div>
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Next action</dt>
                <dd className="mt-0.5 text-slate-900">{next_action.trim() || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Follow-up date</dt>
                <dd className="mt-0.5 tabular-nums text-slate-900">{followUpLabel}</dd>
              </div>
            </dl>
          </div>

          <form action={patchPayerCredentialingRecord} className="w-full min-w-0 shrink-0 space-y-3 lg:max-w-sm">
            <input type="hidden" name="id" value={id} />
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Update next step</p>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Next action
              <input name="next_action" className={inp} defaultValue={next_action} placeholder="What happens next?" />
            </label>
            <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
              Follow-up date
              <input name="next_action_due_date" type="date" className={inp} defaultValue={next_action_due_date} />
            </label>
            <button
              type="submit"
              className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
            >
              Save next step
            </button>
          </form>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          <form action={patchPayerCredentialingRecord} className="inline">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="credentialing_status" value={submittedTargets.credentialing_status} />
            <input type="hidden" name="contracting_status" value={submittedTargets.contracting_status} />
            <button
              type="submit"
              className="rounded-xl border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              Mark Submitted
            </button>
          </form>
          <form action={patchPayerCredentialingRecord} className="inline">
            <input type="hidden" name="id" value={id} />
            <input type="hidden" name="credentialing_status" value={activeTargets.credentialing_status} />
            <input type="hidden" name="contracting_status" value={activeTargets.contracting_status} />
            <button
              type="submit"
              className="rounded-xl border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
            >
              Mark Active
            </button>
          </form>
          {credentialing_status === "denied" ? (
            <form action={reapplyPayerCredentialing} className="inline">
              <input type="hidden" name="credentialing_id" value={id} />
              <button
                type="submit"
                className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-950 shadow-sm ring-1 ring-violet-200/80 hover:bg-violet-100"
              >
                Reapply
              </button>
            </form>
          ) : (
            <form
              action={markPayerCredentialingDenied}
              className="flex flex-col gap-2 rounded-xl border border-red-200/90 bg-red-50/50 p-3 sm:inline-flex sm:max-w-full sm:flex-row sm:flex-wrap sm:items-end"
            >
              <input type="hidden" name="credentialing_id" value={id} />
              <label className="flex min-w-[160px] flex-col gap-1">
                <span className="text-[10px] font-semibold uppercase tracking-wide text-red-900/90">Denial (optional)</span>
                <select
                  name="denial_reason_category"
                  className="rounded-lg border border-red-200/90 bg-white px-2 py-1.5 text-sm text-slate-900"
                  defaultValue=""
                >
                  <option value="">Reason…</option>
                  {PAYER_DENIAL_REASON_VALUES.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-[120px] flex-col gap-1 text-[11px] font-medium text-red-900/90">
                If “Other”
                <input
                  name="denial_reason_other"
                  placeholder="Detail"
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

        {denial_reason.trim() ? (
          <p className="mt-4 rounded-xl border border-red-200/80 bg-red-50/90 px-3 py-2 text-xs text-red-950">
            <span className="font-semibold">Denial reason: </span>
            {denial_reason}
          </p>
        ) : null}

        <p className="mt-3 text-[11px] text-slate-500">
          Record updated{" "}
          {r.updated_at ? formatCredentialingDateTime(String(r.updated_at)) : "—"}
        </p>
      </header>

      {emailFetchErr ? (
        <p className="text-sm text-amber-900">
          Contact email list is unavailable until{" "}
          <span className="font-mono text-xs">payer_credentialing_record_emails</span> is migrated.
        </p>
      ) : (
        <section className={`${cardShell} bg-white p-5 sm:p-6`}>
          <PayerCredentialingEmailsQuick credentialingId={id} initialRows={emailRowsForQuick} />
        </section>
      )}

      <Suspense fallback={<CredentialingChecklistSectionFallback />}>
        <CredentialingChecklistSection credentialingId={id} />
      </Suspense>

      <Suspense fallback={<CredentialingNotesSectionFallback />}>
        <CredentialingNotesSection credentialingId={id} viewerUserId={staff.user_id} />
      </Suspense>
    </div>
  );
}
