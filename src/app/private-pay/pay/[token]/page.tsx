import { redirect } from "next/navigation";

import { PRIVATE_PAY_PUBLIC_INVOICE_PATH } from "@/lib/private-pay/public-urls";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Legacy path — redirect to the canonical public invoice URL. */
export default async function LegacyPrivatePayPayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`${PRIVATE_PAY_PUBLIC_INVOICE_PATH}/${encodeURIComponent(token.trim())}`);
}
