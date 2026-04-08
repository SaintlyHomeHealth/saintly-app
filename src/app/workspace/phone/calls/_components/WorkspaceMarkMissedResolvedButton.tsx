"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";

import { markWorkspaceMissedCallResolved } from "../actions";

type Props = {
  callId: string;
};

export function WorkspaceMarkMissedResolvedButton({ callId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => {
        startTransition(async () => {
          const result = await markWorkspaceMissedCallResolved(callId);
          if (result.ok) router.refresh();
        });
      }}
      className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl border border-sky-200/90 bg-white px-3 py-2.5 text-sm font-semibold text-phone-ink shadow-sm transition hover:bg-phone-ice active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[10rem]"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      {pending ? "Saving…" : "Mark resolved"}
    </button>
  );
}
