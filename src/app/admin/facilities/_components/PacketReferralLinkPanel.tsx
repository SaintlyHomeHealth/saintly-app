"use client";

import { useState } from "react";

import { FacilityReferralQrModal } from "@/app/admin/facilities/_components/FacilityReferralQrModal";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";
import { formatFacilityDate } from "@/lib/crm/facility-address";

export type PacketReferralLinkInfo = {
  source_link_id: string;
  public_url: string;
  token_segment: string;
  view_count?: number;
  leads_count?: number;
  last_referral_at?: string | null;
};

type PacketReferralLinkActionsProps = {
  link: PacketReferralLinkInfo;
  compact?: boolean;
  showStats?: boolean;
};

export function PacketReferralLinkActions({ link, compact = false, showStats = false }: PacketReferralLinkActionsProps) {
  const [qrOpen, setQrOpen] = useState(false);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link.public_url);
      setCopyNotice("Copied");
      setTimeout(() => setCopyNotice(null), 2000);
    } catch {
      setCopyNotice("Copy failed");
    }
  }

  return (
    <>
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "text-xs" : "text-sm"}`}>
        {showStats ? (
          <span className="text-slate-600">
            {link.view_count ?? 0} views · {link.leads_count ?? 0} leads
            {link.last_referral_at ? ` · Last referral ${formatFacilityDate(link.last_referral_at)}` : ""}
          </span>
        ) : null}
        <button type="button" className={compact ? crmActionBtnMuted : crmActionBtnSky} onClick={() => void copyLink()}>
          Copy link
        </button>
        <button type="button" className={crmActionBtnMuted} onClick={() => setQrOpen(true)}>
          Show QR
        </button>
        {copyNotice ? <span className="text-xs font-medium text-emerald-800">{copyNotice}</span> : null}
      </div>
      <FacilityReferralQrModal
        open={qrOpen}
        onClose={() => setQrOpen(false)}
        label="Packet referral link"
        token={link.token_segment}
        referralUrl={link.public_url}
        sourceLinkId={link.source_link_id}
      />
    </>
  );
}

type PacketReferralLinkPanelProps = {
  link: PacketReferralLinkInfo | null;
  loading?: boolean;
  error?: string | null;
  includeInMessage: boolean;
  onIncludeChange: (value: boolean) => void;
  showIncludeToggle: boolean;
};

export function PacketReferralLinkPanel({
  link,
  loading = false,
  error = null,
  includeInMessage,
  onIncludeChange,
  showIncludeToggle,
}: PacketReferralLinkPanelProps) {
  return (
    <fieldset className="mt-4 rounded-xl border border-teal-200 bg-teal-50/40 p-3">
      <legend className="px-1 text-xs font-bold uppercase text-teal-900">Referral link included</legend>
      {loading ? <p className="mt-1 text-sm text-slate-600">Loading trackable referral link…</p> : null}
      {error ? <p className="mt-1 text-sm text-amber-800">{error}</p> : null}
      {link ? (
        <>
          <p className="mt-1 break-all text-xs text-slate-700">{link.public_url}</p>
          <div className="mt-2">
            <PacketReferralLinkActions link={link} compact />
          </div>
          {showIncludeToggle ? (
            <label className="mt-3 flex items-center gap-2 text-sm text-slate-800">
              <input
                type="checkbox"
                checked={includeInMessage}
                onChange={(e) => onIncludeChange(e.target.checked)}
              />
              Include referral link in message
            </label>
          ) : null}
        </>
      ) : null}
    </fieldset>
  );
}
