"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";

import { deleteWorkspaceSmsMessage } from "@/app/workspace/phone/inbox/actions";

type Props = {
  conversationId: string;
  messageId: string;
  /** When false, hide control (e.g. optimistic pending row). */
  allowDelete: boolean;
};

export function WorkspaceSmsDeleteMessageButton({ conversationId, messageId, allowDelete }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (!allowDelete || busy) return;
    const ok = window.confirm("Delete this message? It will be removed from the thread but kept for audit.");
    if (!ok) return;
    setBusy(true);
    try {
      const res = await deleteWorkspaceSmsMessage(conversationId, messageId);
      if (!res.ok) {
        window.alert(
          res.error === "forbidden"
            ? "You do not have permission to delete this message."
            : "Could not delete this message. Try again."
        );
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [allowDelete, busy, conversationId, messageId, router]);

  if (!allowDelete) return null;

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className="inline-flex items-center gap-0.5 rounded px-1 py-0.5 text-[10px] font-semibold text-rose-700/90 hover:bg-rose-50 hover:text-rose-900 disabled:opacity-50"
      title="Delete message"
      aria-label="Delete message"
    >
      <Trash2 className="h-3 w-3 shrink-0 opacity-80" aria-hidden />
      Delete
    </button>
  );
}
