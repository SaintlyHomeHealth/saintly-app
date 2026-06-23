"use client";

import Link from "next/link";

import { crmActionBtnMuted } from "@/components/admin/crm-admin-list-styles";

type Props = {
  faxId: string;
  /** Preserve Fax Center tab/filters when returning from compose. */
  returnPath?: string;
  compact?: boolean;
};

function cloneComposeHref(faxId: string, returnPath?: string): string {
  const params = new URLSearchParams();
  params.set("cloneFromFaxId", faxId);
  if (returnPath?.startsWith("/admin/fax")) {
    const returnParams = new URLSearchParams(returnPath.split("?")[1] ?? "");
    const tab = returnParams.get("tab");
    if (tab) params.set("tab", tab);
  }
  return `/admin/fax?${params.toString()}`;
}

export function SendAnotherDocButton({ faxId, returnPath, compact }: Props) {
  const href = cloneComposeHref(faxId, returnPath);
  const className = compact ? crmActionBtnMuted : crmActionBtnMuted;

  return (
    <Link href={href} className={className} title="Start a new fax packet with the same recipient and patient details">
      Send another doc
    </Link>
  );
}
