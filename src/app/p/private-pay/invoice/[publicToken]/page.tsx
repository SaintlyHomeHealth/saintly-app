import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { PublicInvoiceView } from "@/components/private-pay/PublicInvoiceView";
import { getInvoiceByPublicToken } from "@/lib/private-pay/data";
import { getPrivatePayPaymentInstructions } from "@/lib/private-pay/payment-instructions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Private pay invoice · Saintly Home Health",
  robots: { index: false, follow: false },
};

/**
 * Canonical public invoice page (token-only, no login). Used in SMS/email links.
 */
export default async function PrivatePayPublicInvoicePage({
  params,
}: {
  params: Promise<{ publicToken: string }>;
}) {
  const { publicToken } = await params;
  const invoice = await getInvoiceByPublicToken(publicToken);
  if (!invoice) notFound();

  return (
    <PublicInvoiceView
      invoice={invoice}
      publicToken={publicToken}
      instructions={getPrivatePayPaymentInstructions()}
    />
  );
}
