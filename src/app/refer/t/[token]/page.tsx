import type { Metadata } from "next";
import Link from "next/link";

import { PublicReferralPageShell } from "@/components/marketing/PublicReferralForm";
import { PHONE_DISPLAY, TEL } from "@/components/marketing/marketing-constants";
import { resolvePublicSourceLinkBySegment } from "@/lib/crm/facility-referral-source-links-admin";
import { recordSourceLinkEvent } from "@/lib/crm/facility-referral-source-links";
import { publicTokenSegment } from "@/lib/crm/referral-link-url";

export const metadata: Metadata = {
  title: "Send a Referral",
  description: "Submit a patient referral to Saintly Home Health.",
  robots: { index: false, follow: false },
};

type TokenReferPageProps = {
  params: Promise<{ token: string }>;
};

export default async function TokenReferPage({ params }: TokenReferPageProps) {
  const { token: rawToken } = await params;
  const token = decodeURIComponent(rawToken).trim();

  const link = await resolvePublicSourceLinkBySegment(token);

  if (!link) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-slate-900">Referral link unavailable</h1>
        <p className="mt-3 text-slate-700">
          This referral link is no longer active. Please contact Saintly Home Health.
        </p>
        <p className="mt-4 text-sm text-slate-600">
          Call{" "}
          <a href={TEL} className="font-semibold text-slate-900 underline-offset-2 hover:underline">
            {PHONE_DISPLAY}
          </a>{" "}
          or use our{" "}
          <Link href="/refer" className="font-semibold text-slate-900 underline-offset-2 hover:underline">
            general referral form
          </Link>
          .
        </p>
      </div>
    );
  }

  const segment = publicTokenSegment(link) ?? token;

  void recordSourceLinkEvent({
    sourceLinkId: link.id,
    token: segment,
    eventType: "view",
    facilityId: link.facility_id,
    contactId: link.contact_id,
    campaignId: link.campaign_id,
    salesRepId: link.sales_rep_id,
    metadata: { path: `/refer/t/${segment}`, link_type: link.link_type },
  });

  return (
    <PublicReferralPageShell
      source={link.default_source}
      token={segment}
      headingNote={link.label ? `Referral link: ${link.label}` : undefined}
    />
  );
}
