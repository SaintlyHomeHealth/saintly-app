"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";

import type { FacilityReferralSourceLinkRow } from "@/lib/crm/facility-referral-source-link-types";
import { buildReferralTokenPublicUrl, buildUniversalReferralPublicUrl, publicTokenSegment } from "@/lib/crm/referral-link-url";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";

export type FacilityReferralQrModalProps = {
  open: boolean;
  onClose: () => void;
  label?: string;
  token?: string | null;
  referralUrl?: string | null;
  sourceLinkId?: string | null;
  loading?: boolean;
  error?: string | null;
};

export function FacilityReferralQrModal({
  open,
  onClose,
  label,
  token,
  referralUrl,
  sourceLinkId,
  loading = false,
  error = null,
}: FacilityReferralQrModalProps) {
  const qrRef = useRef<HTMLDivElement>(null);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);

  const url = referralUrl ?? (token ? buildReferralTokenPublicUrl(token) : buildUniversalReferralPublicUrl());

  useEffect(() => {
    if (!open) setCopyNotice(null);
  }, [open]);

  const recordCopy = useCallback(async () => {
    if (!sourceLinkId) return;
    try {
      await fetch(`/api/facilities/source-links/${sourceLinkId}/events`, { method: "GET" });
    } catch {
      // best-effort; copy still works
    }
  }, [sourceLinkId]);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(url);
      setCopyNotice("Link copied.");
      void recordCopy();
    } catch {
      setCopyNotice("Could not copy — select the link below.");
    }
  }

  async function shareLink() {
    if (typeof navigator.share !== "function") {
      await copyLink();
      return;
    }
    try {
      await navigator.share({
        title: label ?? "Saintly referral link",
        text: "Submit a referral to Saintly Home Health:",
        url,
      });
    } catch {
      // user cancelled
    }
  }

  function downloadQr() {
    const svg = qrRef.current?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([svg.outerHTML], { type: "image/svg+xml;charset=utf-8" });
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = "saintly-referral-qr.svg";
    a.click();
    URL.revokeObjectURL(objectUrl);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/50 p-4 sm:items-center">
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="referral-qr-title"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="referral-qr-title" className="text-lg font-bold text-slate-900">
              Referral QR
            </h2>
            {label ? <p className="mt-1 text-sm text-slate-600">{label}</p> : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-slate-500 hover:bg-slate-100">
            Close
          </button>
        </div>

        {loading ? <p className="mt-6 text-sm text-slate-600">Loading referral link…</p> : null}
        {error ? <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{error}</p> : null}

        {!loading && !error ? (
          <>
            <div ref={qrRef} className="mx-auto mt-5 flex justify-center rounded-xl border border-slate-100 bg-white p-4">
              <QRCodeSVG value={url} size={220} level="M" includeMargin />
            </div>

            <p className="mt-4 break-all rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-700">{url}</p>

            {copyNotice ? (
              <p className="mt-2 text-xs font-medium text-emerald-800" role="status">
                {copyNotice}
              </p>
            ) : null}

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" className={crmActionBtnSky} onClick={() => void copyLink()}>
                Copy link
              </button>
              <button type="button" className={crmActionBtnMuted} onClick={() => void shareLink()}>
                Share link
              </button>
              <button type="button" className={`${crmActionBtnMuted} col-span-2`} onClick={downloadQr}>
                Download QR (SVG)
              </button>
            </div>

            <p className="mt-3 text-xs text-slate-500">
              Show this QR in the office so partners can scan and send referrals directly to Saintly.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

export function linkToQrModalProps(link: FacilityReferralSourceLinkRow): {
  token: string | null;
  referralUrl: string;
  sourceLinkId: string;
  label: string | null;
} {
  const segment = publicTokenSegment(link);
  return {
    token: segment,
    referralUrl: segment ? buildReferralTokenPublicUrl(segment) : buildUniversalReferralPublicUrl(),
    sourceLinkId: link.id,
    label: link.label,
  };
}
