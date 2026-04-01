import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { updatePayerCredentialingRecord } from "../actions";
import {
  CONTRACTING_STATUS_VALUES,
  CREDENTIALING_STATUS_VALUES,
  CREDENTIALING_STATUS_LABELS,
  CONTRACTING_STATUS_LABELS,
} from "@/lib/crm/credentialing-status-options";
import {
  analyzePayerCredentialingAttention,
  CREDENTIALING_ATTENTION_REASON_LABELS,
  type PayerCredentialingListRow,
} from "@/lib/crm/credentialing-command-center";
import { ContractingStatusBadge, CredentialingStatusBadge } from "@/components/crm/CredentialingBadges";
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
  const payer_type = String(r.payer_type ?? "");
  const market_state = String(r.market_state ?? "");
  const credentialing_status = String(r.credentialing_status ?? "in_progress");
  const contracting_status = String(r.contracting_status ?? "pending");
  const last_follow_up_at = typeof r.last_follow_up_at === "string" ? r.last_follow_up_at : null;

  const attentionRow: PayerCredentialingListRow = {
    id: credentialingId.trim(),
    payer_name,
    payer_type: payer_type.trim() ? payer_type : null,
    market_state: market_state.trim() ? market_state : null,
    credentialing_status,
    contracting_status,
    portal_url: portal_url.trim() ? portal_url : null,
    primary_contact_name: typeof r.primary_contact_name === "string" ? r.primary_contact_name : null,
    primary_contact_phone: typeof r.primary_contact_phone === "string" ? r.primary_contact_phone : null,
    primary_contact_email: typeof r.primary_contact_email === "string" ? r.primary_contact_email : null,
    notes: typeof r.notes === "string" ? r.notes : null,
    last_follow_up_at,
    updated_at: typeof r.updated_at === "string" ? r.updated_at : "",
  };

  const attention = analyzePayerCredentialingAttention(attentionRow);
  const attentionReasonText = attention.reasons.map((x) => CREDENTIALING_ATTENTION_REASON_LABELS[x]).join(" · ");

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

      <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-gradient-to-br from-white via-sky-50/40 to-cyan-50/30 p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 flex-1 space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">Payer</p>
              <h1 className="mt-0.5 text-2xl font-bold text-slate-900">{payer_name}</h1>
              <p className="mt-1 font-mono text-[11px] text-slate-400">{credentialingId}</p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-slate-700">
              {(payer_type ?? "").trim() ? (
                <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-800">
                  <span className="text-slate-500">Type · </span>
                  &nbsp;{payer_type.trim()}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-1 text-xs text-slate-500">
                  Type not set
                </span>
              )}
              {(market_state ?? "").trim() ? (
                <span className="inline-flex items-center rounded-lg border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium text-slate-800">
                  <span className="text-slate-500">Market · </span>
                  &nbsp;{market_state.trim()}
                </span>
              ) : (
                <span className="inline-flex items-center rounded-lg border border-dashed border-slate-200 bg-white/60 px-3 py-1 text-xs text-slate-500">
                  Market not set
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <CredentialingStatusBadge status={credentialing_status} />
              <ContractingStatusBadge status={contracting_status} />
            </div>
            <p className="text-sm text-slate-600">
              <span className="font-semibold text-slate-700">Last follow-up: </span>
              {last_follow_up_at
                ? new Date(last_follow_up_at).toLocaleString("en-US", {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })
                : "—"}
            </p>
          </div>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:flex-col">
            {portal_url.trim() ? (
              <a
                href={portal_url.trim()}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-[20px] bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-sky-200/60 transition hover:-translate-y-px hover:shadow-md"
              >
                Open portal
              </a>
            ) : null}
            <Link
              href="/admin/credentialing"
              className="inline-flex items-center justify-center rounded-[20px] border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50"
            >
              Back to list
            </Link>
          </div>
        </div>

        {attention.needsAttention ? (
          <div
            className="mt-4 rounded-[20px] border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950"
            role="status"
          >
            <p className="font-bold">Needs attention</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-900">{attentionReasonText}</p>
          </div>
        ) : null}
      </section>

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
          <input
            name="primary_contact_name"
            className={inp}
            defaultValue={String(r.primary_contact_name ?? "")}
          />
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
          className="rounded-[20px] border border-sky-600 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-900 shadow-sm hover:bg-sky-100"
        >
          Save changes
        </button>
      </form>

      <div className="rounded-[28px] border border-slate-100 bg-slate-50/80 p-4 text-xs text-slate-600">
        <p>
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
