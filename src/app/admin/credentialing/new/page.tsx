import Link from "next/link";
import { redirect } from "next/navigation";

import { submitNewPayerCredentialingForm } from "../actions";
import {
  CONTRACTING_STATUS_LABELS,
  CONTRACTING_STATUS_VALUES,
  CREDENTIALING_PRIORITY_LABELS,
  CREDENTIALING_PRIORITY_VALUES,
  CREDENTIALING_STATUS_LABELS,
  CREDENTIALING_STATUS_VALUES,
} from "@/lib/crm/credentialing-status-options";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { credentialingStaffLabel, loadCredentialingStaffAssignees } from "@/lib/crm/credentialing-staff-directory";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const inp =
  "mt-0.5 w-full max-w-lg rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

export default async function AdminCredentialingNewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/admin");
  }

  const sp = await searchParams;
  const err = typeof sp.error === "string" ? sp.error : "";
  const staffOptions = await loadCredentialingStaffAssignees();

  return (
    <div className="space-y-6 p-6">
      <AdminPageHeader
        eyebrow="Credentialing"
        title="New payer record"
        description={
          <>
            Adds a row to <span className="font-mono text-xs">payer_credentialing_records</span>. No passwords stored
            here—use portal hints only.
            {err === "forbidden" ? <span className="mt-2 block text-sm text-red-700">Not allowed.</span> : null}
            {err === "name_required" ? (
              <span className="mt-2 block text-sm text-red-700">Payer name is required.</span>
            ) : null}
            {err === "invalid_status" ? (
              <span className="mt-2 block text-sm text-red-700">Invalid status value.</span>
            ) : null}
            {err === "insert_failed" ? (
              <span className="mt-2 block text-sm text-red-700">Could not save. Check DB migration.</span>
            ) : null}
          </>
        }
      />

      <form action={submitNewPayerCredentialingForm} className="max-w-2xl space-y-4 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm">
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Payer name <span className="text-red-600">*</span>
          <input name="payer_name" required className={inp} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Payer type / plan type
          <input name="payer_type" className={inp} placeholder="e.g. Medicare Advantage, Medicaid" />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          State / market
          <input name="market_state" className={inp} placeholder="e.g. AZ" maxLength={32} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Assigned owner
          <select name="assigned_owner_user_id" className={inp} defaultValue="">
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
          <select name="priority" className={inp} defaultValue="medium">
            {CREDENTIALING_PRIORITY_VALUES.map((v) => (
              <option key={v} value={v}>
                {CREDENTIALING_PRIORITY_LABELS[v]}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Credentialing status
            <select name="credentialing_status" className={inp} defaultValue="in_progress">
              {CREDENTIALING_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {CREDENTIALING_STATUS_LABELS[v]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Contracting status
            <select name="contracting_status" className={inp} defaultValue="pending">
              {CONTRACTING_STATUS_VALUES.map((v) => (
                <option key={v} value={v}>
                  {CONTRACTING_STATUS_LABELS[v]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Portal URL
          <input name="portal_url" type="url" className={inp} placeholder="https://…" />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Portal username hint (not password)
          <input name="portal_username_hint" className={inp} placeholder="e.g. shared intake email" />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Primary contact name
          <input name="primary_contact_name" className={inp} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Primary contact phone
          <input name="primary_contact_phone" className={inp} autoComplete="tel" />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Primary contact email
          <input name="primary_contact_email" type="email" className={inp} autoComplete="email" />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Notes
          <textarea name="notes" rows={4} className={inp} />
        </label>
        <button
          type="submit"
          className="rounded border border-sky-600 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
        >
          Create record
        </button>
      </form>
    </div>
  );
}
