"use client";

import { useCallback, useEffect, useState } from "react";

import {
  FacilityReferralQrModal,
  linkToQrModalProps,
} from "@/app/admin/facilities/_components/FacilityReferralQrModal";
import type {
  CreateSourceLinkInput,
  FacilityReferralSourceLinkRow,
  ReferralSourceLinkType,
} from "@/lib/crm/facility-referral-source-link-types";
import { buildReferralTokenPublicUrl } from "@/lib/crm/referral-link-url";
import { formatFacilityDate } from "@/lib/crm/facility-address";
import { crmActionBtnMuted, crmActionBtnSky, crmFilterInputCls, crmPrimaryCtaCls } from "@/components/admin/crm-admin-list-styles";

type StaffOption = { user_id: string; label: string };

type FacilitySourceLinksViewProps = {
  canManage: boolean;
  staffOptions: StaffOption[];
  initialCampaignId?: string;
  initialFacilityId?: string;
};

const LINK_TYPES: ReferralSourceLinkType[] = ["campaign", "rep", "facility", "packet", "custom", "material"];

const MATERIAL_TYPES = ["postcard", "business_card", "flyer", "swag_bag", "packet", "other"];

export function FacilitySourceLinksView({
  canManage,
  staffOptions,
  initialCampaignId = "",
  initialFacilityId = "",
}: FacilitySourceLinksViewProps) {
  const [links, setLinks] = useState<FacilityReferralSourceLinkRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState("");
  const [qrLink, setQrLink] = useState<FacilityReferralSourceLinkRow | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<CreateSourceLinkInput>({
    link_type: "campaign",
    label: "",
    campaign_id: initialCampaignId || null,
    sales_rep_id: null,
    facility_id: initialFacilityId || null,
    material_type: "postcard",
    short_slug: null,
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (filterType) params.set("link_type", filterType);
      if (initialCampaignId) params.set("campaign_id", initialCampaignId);
      if (initialFacilityId) params.set("facility_id", initialFacilityId);
      const res = await fetch(`/api/facilities/source-links?${params.toString()}`);
      const data = (await res.json()) as { ok?: boolean; links?: FacilityReferralSourceLinkRow[] };
      if (!data.ok) {
        setError("Could not load source links.");
        return;
      }
      setLinks(data.links ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, [filterType, initialCampaignId, initialFacilityId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createLink(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setCreating(true);
    try {
      const res = await fetch("/api/facilities/source-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Create failed.");
        return;
      }
      setCreateOpen(false);
      setForm({
        link_type: "campaign",
        label: "",
        campaign_id: initialCampaignId || null,
        sales_rep_id: null,
        facility_id: initialFacilityId || null,
        material_type: "postcard",
        short_slug: null,
      });
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function archiveLink(id: string) {
    if (!canManage) return;
    await fetch(`/api/facilities/source-links/${id}/archive`, { method: "POST" });
    await load();
  }

  async function copyUrl(link: FacilityReferralSourceLinkRow) {
    const segment = link.short_slug ?? link.token;
    if (!segment) return;
    await navigator.clipboard.writeText(buildReferralTokenPublicUrl(segment));
  }

  return (
    <div className="space-y-5">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-[10rem] flex-col gap-0.5 text-[11px] font-medium text-slate-600">
          Link type
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className={crmFilterInputCls}>
            <option value="">All types</option>
            {LINK_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        {canManage ? (
          <button type="button" className={crmPrimaryCtaCls} onClick={() => setCreateOpen(true)}>
            + Create link
          </button>
        ) : null}
      </div>

      {createOpen && canManage ? (
        <form onSubmit={(e) => void createLink(e)} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
          <h3 className="text-sm font-bold text-slate-900">New referral link</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-medium text-slate-700">
              Label *
              <input
                required
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                className={`${crmFilterInputCls} mt-1 w-full`}
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Link type
              <select
                value={form.link_type}
                onChange={(e) => setForm((f) => ({ ...f, link_type: e.target.value as ReferralSourceLinkType }))}
                className={`${crmFilterInputCls} mt-1 w-full`}
              >
                {LINK_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Short slug (optional)
              <input
                value={form.short_slug ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, short_slug: e.target.value || null }))}
                placeholder="gilbert-podiatry"
                className={`${crmFilterInputCls} mt-1 w-full`}
              />
            </label>
            <label className="text-xs font-medium text-slate-700">
              Material type
              <select
                value={form.material_type ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, material_type: e.target.value }))}
                className={`${crmFilterInputCls} mt-1 w-full`}
              >
                {MATERIAL_TYPES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Sales rep
              <select
                value={form.sales_rep_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, sales_rep_id: e.target.value || null }))}
                className={`${crmFilterInputCls} mt-1 w-full`}
              >
                <option value="">None</option>
                {staffOptions.map((s) => (
                  <option key={s.user_id} value={s.user_id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-medium text-slate-700">
              Campaign ID
              <input
                value={form.campaign_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, campaign_id: e.target.value || null }))}
                className={`${crmFilterInputCls} mt-1 w-full`}
              />
            </label>
            <label className="text-xs font-medium text-slate-700 sm:col-span-2">
              Facility ID (optional)
              <input
                value={form.facility_id ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, facility_id: e.target.value || null }))}
                className={`${crmFilterInputCls} mt-1 w-full`}
              />
            </label>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={creating} className={crmActionBtnSky}>
              {creating ? "Creating…" : "Create link"}
            </button>
            <button type="button" className={crmActionBtnMuted} onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {loading ? <p className="text-sm text-slate-600">Loading links…</p> : null}

      {!loading && links.length === 0 ? (
        <p className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">
          No referral source links yet.
        </p>
      ) : null}

      <div className="space-y-3">
        {links.map((link) => {
          const segment = link.short_slug ?? link.token;
          const path = segment ? `/refer/t/${segment}` : null;
          return (
            <article key={link.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{link.label ?? "Referral link"}</h3>
                  <p className="text-xs text-slate-600">
                    {link.link_type} · {link.status}
                    {link.material_type ? ` · ${link.material_type}` : ""}
                  </p>
                  {path ? (
                    <p className="mt-1 break-all text-xs text-violet-800">{buildReferralTokenPublicUrl(segment!)}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-slate-500">
                    {[link.facility_name, link.campaign_name, link.sales_rep_label].filter(Boolean).join(" · ") ||
                      "No facility/campaign context"}
                  </p>
                  {link.link_type === "packet" ? (
                    <p className="mt-1 text-xs text-slate-600">
                      {[
                        link.packet_request_label,
                        link.packet_material_name,
                        link.packet_delivery_method ? `via ${link.packet_delivery_method}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "Packet delivery link"}
                    </p>
                  ) : null}
                </div>
                <div className="text-right text-xs text-slate-600">
                  <div>{link.view_count ?? 0} views</div>
                  <div>{link.submission_count ?? 0} submissions</div>
                  <div>{link.leads_created_count ?? 0} leads</div>
                  {link.last_used_at ? <div>Last used {formatFacilityDate(link.last_used_at)}</div> : null}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={crmActionBtnSky} onClick={() => setQrLink(link)}>
                  Show QR
                </button>
                <button type="button" className={crmActionBtnMuted} onClick={() => void copyUrl(link)}>
                  Copy link
                </button>
                {canManage && link.status === "active" ? (
                  <button type="button" className={`${crmActionBtnMuted} text-rose-800`} onClick={() => void archiveLink(link.id)}>
                    Archive
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {qrLink ? (
        <FacilityReferralQrModal
          open
          onClose={() => setQrLink(null)}
          {...linkToQrModalProps(qrLink)}
        />
      ) : null}
    </div>
  );
}
