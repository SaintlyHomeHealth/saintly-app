"use client";

import { useCallback, useState } from "react";

import {
  FacilityReferralQrModal,
  linkToQrModalProps,
} from "@/app/admin/facilities/_components/FacilityReferralQrModal";
import type { ReferralSourceLinkType } from "@/lib/crm/facility-referral-source-link-types";
import { buildUniversalReferralPublicUrl } from "@/lib/crm/referral-link-url";
import { crmActionBtnMuted, crmActionBtnSky } from "@/components/admin/crm-admin-list-styles";

type ShowReferralQrButtonProps = {
  facilityId?: string | null;
  campaignId?: string | null;
  salesRepId?: string | null;
  facilityName?: string | null;
  label?: string | null;
  linkType?: ReferralSourceLinkType;
  fallbackToUniversal?: boolean;
  className?: string;
  showCopy?: boolean;
};

export function ShowReferralQrButton({
  facilityId,
  campaignId,
  salesRepId,
  facilityName,
  label,
  linkType,
  fallbackToUniversal = true,
  className,
  showCopy = true,
}: ShowReferralQrButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [modalProps, setModalProps] = useState<{
    token: string | null;
    referralUrl: string;
    sourceLinkId: string | null;
    label: string | null;
  }>({ token: null, referralUrl: buildUniversalReferralPublicUrl(), sourceLinkId: null, label: null });

  const resolvedLinkType: ReferralSourceLinkType =
    linkType ?? (facilityId ? "facility" : campaignId ? "campaign" : salesRepId ? "rep" : "custom");

  const loadLink = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (fallbackToUniversal && !facilityId && !campaignId && !salesRepId) {
      setModalProps({
        token: null,
        referralUrl: buildUniversalReferralPublicUrl(),
        sourceLinkId: null,
        label: label ?? "Universal referral link",
      });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/facilities/source-links/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link_type: resolvedLinkType,
          facility_id: facilityId ?? null,
          campaign_id: campaignId ?? null,
          sales_rep_id: salesRepId ?? null,
          label: label ?? (facilityName ? `${facilityName} referral` : null),
          create_if_missing: true,
        }),
      });
      const data = (await res.json()) as {
        ok?: boolean;
        link?: Parameters<typeof linkToQrModalProps>[0];
      };

      if (!res.ok || !data.ok || !data.link) {
        if (fallbackToUniversal) {
          setModalProps({
            token: null,
            referralUrl: buildUniversalReferralPublicUrl(),
            sourceLinkId: null,
            label: label ?? "Universal referral link",
          });
          return;
        }
        setError("Could not load referral link.");
        return;
      }

      const props = linkToQrModalProps(data.link);
      setModalProps({
        token: props.token,
        referralUrl: props.referralUrl,
        sourceLinkId: props.sourceLinkId,
        label: props.label ?? label ?? facilityName ?? null,
      });
    } catch {
      if (fallbackToUniversal) {
        setModalProps({
          token: null,
          referralUrl: buildUniversalReferralPublicUrl(),
          sourceLinkId: null,
          label: label ?? "Universal referral link",
        });
      } else {
        setError("Network error loading referral link.");
      }
    } finally {
      setLoading(false);
    }
  }, [campaignId, facilityId, facilityName, fallbackToUniversal, label, resolvedLinkType, salesRepId]);

  async function openModal() {
    setOpen(true);
    await loadLink();
  }

  async function copyLinkOnly() {
    try {
      const res = await fetch("/api/facilities/source-links/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          link_type: resolvedLinkType,
          facility_id: facilityId ?? null,
          campaign_id: campaignId ?? null,
          sales_rep_id: salesRepId ?? null,
          label: label ?? (facilityName ? `${facilityName} referral` : null),
          create_if_missing: true,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; link?: Parameters<typeof linkToQrModalProps>[0] };
      const url =
        data.ok && data.link
          ? linkToQrModalProps(data.link).referralUrl
          : buildUniversalReferralPublicUrl();
      await navigator.clipboard.writeText(url);
    } catch {
      // ignore
    }
  }

  const btnCls = className ?? crmActionBtnMuted;

  return (
    <>
      <button type="button" className={btnCls} onClick={() => void openModal()}>
        Show Referral QR
      </button>
      {showCopy ? (
        <button type="button" className={crmActionBtnSky} onClick={() => void copyLinkOnly()}>
          Copy Referral Link
        </button>
      ) : null}

      <FacilityReferralQrModal
        open={open}
        onClose={() => setOpen(false)}
        label={modalProps.label ?? label ?? facilityName ?? undefined}
        token={modalProps.token}
        referralUrl={modalProps.referralUrl}
        sourceLinkId={modalProps.sourceLinkId}
        loading={loading}
        error={error}
      />
    </>
  );
}
