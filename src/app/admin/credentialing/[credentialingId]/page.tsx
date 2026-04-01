import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { updatePayerCredentialingRecord } from "../actions";
import {
  CONTRACTING_STATUS_LABELS,
  CONTRACTING_STATUS_VALUES,
  CREDENTIALING_STATUS_LABELS,
  CREDENTIALING_STATUS_VALUES,
} from "@/lib/crm/credentialing-status-options";
import { formatPhoneForDisplay } from "@/lib/phone/us-phone-format";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const inp =
  "mt-0.5 w-full max-w-lg rounded border border-slate-200 px-2 py-1.5 text-sm text-slate-800";

export default async function AdminCredentialingDetailPage({
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
  const { data: row, error } = await supabase
    .from("payer_credentialing_records")
    .select("*")
    .eq("id", credentialingId.trim())
    .maybeSingle();

  if (error || !row) {
    notFound();
  }

  const r = row as Record<string, unknown>;
  const payer_name = String(r.payer_name ?? "");
  const portal_url = typeof r.portal_url === "string" ? r.portal_url : "";

  return (
    <div className="space-y-6 p-6">
      <nav className="flex flex-wrap gap-3 text-sm font-semibold text-sky-800">
        <Link href="/admin" className="underline-offset-2 hover:underline">
          Admin
        </Link>
        <span className="text-slate-300">|</span>
        <Link href="/admin/credentialing" className="underline-offset-2 hover:underline">
          Credentialing
        </Link>
        <span className="text-slate-300">|</span>
        <span className="text-slate-900">Record</span>
      </nav>

      <div>
        <h1 className="text-2xl font-bold text-slate-900">{payer_name}</h1>
        <p className="mt-1 font-mono text-xs text-slate-500">{credentialingId}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {portal_url.trim() ? (
          <a
            href={portal_url.trim()}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-[20px] border border-sky-600 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
          >
            Open portal
          </a>
        ) : null}
        <Link
          href="/admin/credentialing"
          className="inline-flex items-center rounded-[20px] border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
        >
          Back to list
        </Link>
      </div>

      <form
        action={updatePayerCredentialingRecord}
        className="space-y-6 rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm"
      >
        <input type="hidden" name="id" value={credentialingId} />
        <h2 className="text-sm font-bold text-slate-900">Update record</h2>

        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Payer name
          <input name="payer_name" className={inp} defaultValue={payer_name} required />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Payer type / plan type
          <input name="payer_type" className={inp} defaultValue={String(r.payer_type ?? "")} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          State / market
          <input name="market_state" className={inp} defaultValue={String(r.market_state ?? "")} />
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
            Credentialing status
            <select
              name="credentialing_status"
              className={inp}
              defaultValue={String(r.credentialing_status ?? "in_progress")}
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
              defaultValue={String(r.contracting_status ?? "pending")}
            >
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
          <input name="portal_url" type="url" className={inp} defaultValue={portal_url} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Portal username hint (not password)
          <input
            name="portal_username_hint"
            className={inp}
            defaultValue={String(r.portal_username_hint ?? "")}
          />
        </label>

        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Primary contact name
          <input name="primary_contact_name" className={inp} defaultValue={String(r.primary_contact_name ?? "")} />
        </label>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Primary contact phone
          <input
            name="primary_contact_phone"
            className={inp}
            defaultValue={String(r.primary_contact_phone ?? "")}
            autoComplete="tel"
          />
        </label>
        <p className="text-xs text-slate-500">
          Display:{" "}
          <span className="tabular-nums font-medium text-slate-700">
            {formatPhoneForDisplay(typeof r.primary_contact_phone === "string" ? r.primary_contact_phone : "")}
          </span>
        </p>
        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Primary contact email
          <input
            name="primary_contact_email"
            type="email"
            className={inp}
            defaultValue={String(r.primary_contact_email ?? "")}
          />
        </label>

        <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Notes
          <textarea name="notes" rows={5} className={inp} defaultValue={String(r.notes ?? "")} />
        </label>

        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input type="checkbox" name="mark_follow_up_now" value="1" className="rounded border-slate-300" />
          Log follow-up as now (sets <span className="font-mono text-xs">last_follow_up_at</span>)
        </label>

        <button
          type="submit"
          className="rounded border border-sky-600 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 hover:bg-sky-100"
        >
          Save changes
        </button>
      </form>

      <div className="rounded-[28px] border border-slate-100 bg-slate-50/80 p-4 text-xs text-slate-600">
        <p>
          Last follow-up:{" "}
          {r.last_follow_up_at
            ? new Date(String(r.last_follow_up_at)).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "—"}
        </p>
        <p className="mt-1">
          Updated:{" "}
          {r.updated_at
            ? new Date(String(r.updated_at)).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })
            : "—"}
        </p>
      </div>
    </div>
  );
}
