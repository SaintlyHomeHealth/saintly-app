"use client";

import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { Trash2 } from "lucide-react";

import { softDeleteWorkspaceVoicemailListItem } from "@/app/workspace/phone/inbox/actions";

const actionBtnCls =
  "inline-flex min-h-[32px] items-center justify-center rounded-xl border border-rose-200/90 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-rose-800 transition hover:bg-rose-50";

type Props = {
  callId: string;
};

export function WorkspaceVoicemailDeleteButton({ callId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (busy) return;
    const ok = window.confirm(
      "Remove this voicemail from your list? It stays in the database for a while; you can view it under Deleted VM."
    );
    if (!ok) return;
    setBusy(true);
    try {
      const res = await softDeleteWorkspaceVoicemailListItem(callId);
      if (!res.ok) {
        window.alert(
          res.error === "forbidden"
            ? "You do not have permission to delete this voicemail."
            : "Could not delete this voicemail. Try again."
        );
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }, [busy, callId, router]);

  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className={`${actionBtnCls} disabled:opacity-60`}
      title="Delete voicemail from list"
    >
      <Trash2 className="mr-1 h-3.5 w-3.5" aria-hidden />
      Delete
    </button>
  );
}
