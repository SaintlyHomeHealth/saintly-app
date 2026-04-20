"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";

import { deleteWorkspaceSmsConversation } from "@/app/workspace/phone/inbox/actions";

type Props = {
  conversationId: string;
  /** Navigate here after successful delete (inbox list URL). */
  afterDeleteHref: string;
  compact?: boolean;
};

export function WorkspaceSmsDeleteConversationButton({
  conversationId,
  afterDeleteHref,
  compact = false,
}: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (busy) return;
    const ok = window.confirm(
      "Delete this entire conversation from the inbox? Messages stay in the database for audit, but will be hidden here. New texts to this number can bring the thread back."
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteWorkspaceSmsConversation(conversationId);
      if (!res.ok) {
        window.alert(
          res.error === "forbidden"
            ? "You do not have permission to delete this thread."
            : "Could not delete this conversation. Try again."
        );
        return;
      }
      router.push(afterDeleteHref);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [afterDeleteHref, conversationId, router]);

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className={`inline-flex items-center gap-1 rounded-md border border-rose-200/90 bg-white font-semibold text-rose-800 shadow-sm transition hover:bg-rose-50 disabled:opacity-60 ${
        compact ? "px-2 py-1 text-[11px]" : "px-2.5 py-1.5 text-xs"
      }`}
      title="Delete conversation"
    >
      <Trash2 className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} aria-hidden />
      {compact ? "Delete" : "Delete thread"}
    </button>
  );
}
