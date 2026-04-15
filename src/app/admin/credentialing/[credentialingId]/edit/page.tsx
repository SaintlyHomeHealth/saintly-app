import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";

import { updatePayerCredentialingRecord } from "../../actions";
import {
  CredentialingAttachmentsSection,
  CredentialingAttachmentsSectionFallback,
} from "../CredentialingAttachmentsSection";
import { CredentialingDocumentsStatusForm } from "../CredentialingDocumentsStatusForm";
import {
  CONTRACTING_STATUS_LABELS,
  CONTRACTING_STATUS_VALUES,
  CREDENTIALING_PRIORITY_LABELS,
  CREDENTIALING_PRIORITY_VALUES,
  CREDENTIALING_STATUS_LABELS,
  CREDENTIALING_STATUS_VALUES,
  isCredentialingPriority,
} from "@/lib/crm/credentialing-status-options";
import { PAYER_CREDENTIALING_RECORD_DETAIL_SELECT } from "@/lib/crm/payer-credentialing-record-select";
import type { PayerCredentialingRecordEmail } from "@/lib/crm/payer-credentialing-contact";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { PayerCredentialingEmailsQuick } from "@/components/credentialing/PayerCredentialingEmailsQuick";
import { credentialingStaffLabel, loadCredentialingStaffAssignees } from "@/lib/crm/credentialing-staff-directory";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const inp =
  "mt-0.5 w-full max-w-lg rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

const cardShell =
  "rounded-[28px] border border-slate-200/90 bg-gradient-to-b from-white to-slate-50/90 shadow-[0_1px_3px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/60";

export default async function AdminCredentialingEditPage({
  params,
}: {
  params: Promise<{ credentialingId: string }>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const { credentialingId } = await params;
  if (!credentialingId?.trim()) notFound();

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
  const portal_url = typeof r.portal_url === "string" ? r.portal_url : "";
  const portal_username_hint = typeof r.portal_username_hint === "string" ? r.portal_username_hint : "";
  const payer_type = String(r.payer_type ?? "");
  const market_state = String(r.market_state ?? "");
  const credentialing_status = String(r.credentialing_status ?? "in_progress");
  const contracting_status = String(r.contracting_status ?? "pending");
  const assigned_owner_user_id =
    typeof r.assigned_owner_user_id === "string" ? r.assigned_owner_user_id.trim() : "";
  const next_action = typeof r.next_action === "string" ? r.next_action : "";
  const next_action_due_date =
    typeof r.next_action_due_date === "string" ? r.next_action_due_date.slice(0, 10) : "";
  const priorityRaw = typeof r.priority === "string" ? r.priority : "medium";
  const priority = isCredentialingPriority(priorityRaw) ? priorityRaw : "medium";

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

  const staffOptions = await loadCredentialingStaffAssignees();

  return (
    <div className="scroll-smooth space-y-8 p-6 pb-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href={`/admin/credentialing/${encodeURIComponent(id)}`}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4 shrink-0 text-slate-600" aria-hidden />
          Back to command center
        </Link>
      </div>

      <div>
        <h1 className="text-xl font-bold text-slate-950">Edit payer record</h1>
        <p className="mt-1 text-sm text-slate-600">{payer_name}</p>
      </div>

      {emailFetchErr ? (
        <p className="text-sm text-amber-900">
          Contact email list is unavailable until{" "}
          <span className="font-mono text-xs">payer_credentialing_record_emails</span> is migrated.
        </p>
      ) : null}

      <section className={`${cardShell} p-5 sm:p-6`}>
        <h2 className="text-sm font-semibold text-slate-900">Email addresses</h2>
        <p className="mt-1 text-xs text-slate-500">Changes save automatically.</p>
        <div className="mt-4">
          <PayerCredentialingEmailsQuick credentialingId={id} initialRows={emailRowsForQuick} />
        </div>
      </section>

      <form action={updatePayerCredentialingRecord} className={`space-y-6 ${cardShell} p-5 sm:p-6`}>
        <input type="hidden" name="id" value={id} />
        <h2 className="text-sm font-semibold text-slate-900">All fields</h2>

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
          Primary contact email (legacy column — synced from email list)
          <input
            name="primary_contact_email"
            type="email"
            className={inp}
            defaultValue={String(r.primary_contact_email ?? "")}
          />
        </label>

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

      <Suspense fallback={<div className={`${cardShell} h-40 animate-pulse bg-slate-100/90`} />}>
        <CredentialingDocumentsStatusForm credentialingId={id} />
      </Suspense>

      <Suspense fallback={<CredentialingAttachmentsSectionFallback />}>
        <CredentialingAttachmentsSection credentialingId={id} />
      </Suspense>
    </div>
  );
}
