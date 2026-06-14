import type { Metadata } from "next";

import { PublicReferralPageShell } from "@/components/marketing/PublicReferralForm";
import { getUniversalSourceLink, recordSourceLinkEvent } from "@/lib/crm/facility-referral-source-links";

export const metadata: Metadata = {
  title: "Send a Referral",
  description:
    "Submit a patient referral to Saintly Home Health — secure partner intake for offices, clinics, and facilities.",
  robots: { index: true, follow: true },
};

type ReferPageProps = {
  searchParams: Promise<{ src?: string }>;
};

export default async function ReferPage({ searchParams }: ReferPageProps) {
  const params = await searchParams;
  const source = (params.src ?? "printed_materials").trim() || "printed_materials";

  const universalLink = await getUniversalSourceLink();
  void recordSourceLinkEvent({
    sourceLinkId: universalLink?.id ?? null,
    eventType: "view",
    metadata: { source, path: "/refer" },
  });

  return <PublicReferralPageShell source={source} />;
}
