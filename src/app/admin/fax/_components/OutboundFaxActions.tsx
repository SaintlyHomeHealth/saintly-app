import Link from "next/link";

import { crmActionBtnMuted } from "@/components/admin/crm-admin-list-styles";

import { DeleteFaxButton } from "./DeleteFaxButton";
import { ResendFaxButton } from "./ResendFaxButton";
import { SendAnotherDocButton } from "./SendAnotherDocButton";

type Props = {
  faxId: string;
  toNumber: string | null;
  note: string | null;
  detailHref: string;
  returnTo: string;
  allowHardDelete: boolean;
  compact?: boolean;
};

/** Shared outbound fax row/detail actions: Open, Resend, Send another doc, Delete. */
export function OutboundFaxActions({
  faxId,
  toNumber,
  note,
  detailHref,
  returnTo,
  allowHardDelete,
  compact = true,
}: Props) {
  return (
    <>
      <Link href={detailHref} className={crmActionBtnMuted}>
        Open
      </Link>
      <ResendFaxButton faxId={faxId} initialRecipientNumber={toNumber} note={note} compact={compact} />
      <SendAnotherDocButton faxId={faxId} returnPath={returnTo} compact={compact} />
      <DeleteFaxButton faxId={faxId} returnTo={returnTo} allowHardDelete={allowHardDelete} compact={compact} />
    </>
  );
}
