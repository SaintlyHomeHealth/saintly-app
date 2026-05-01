"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { deletePayerCredentialingAttachment } from "../actions";

const CONFIRM_MESSAGE =
  "Delete this attachment? This should only be used if the file was uploaded to the wrong carrier.";

export function CredentialingAttachmentDeleteButton({
  credentialingId,
  attachmentId,
}: {
  credentialingId: string;
  attachmentId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm(CONFIRM_MESSAGE)) return;
    const fd = new FormData();
    fd.set("credentialing_id", credentialingId);
    fd.set("attachment_id", attachmentId);
    startTransition(async () => {
      const result = await deletePayerCredentialingAttachment(fd);
      if (result.ok) {
        router.refresh();
      } else {
        window.alert(result.error);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-900 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isPending ? "Deleting…" : "Delete"}
    </button>
  );
}
