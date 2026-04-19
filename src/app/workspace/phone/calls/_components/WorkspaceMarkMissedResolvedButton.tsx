"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { CheckCircle2 } from "lucide-react";

import { markWorkspaceMissedCallResolved } from "../actions";

type Props = {
  callId: string;
  /** Icon-only control for dense call list rows. */
  variant?: "default" | "compact";
};

export function WorkspaceMarkMissedResolvedButton({ callId, variant = "default" }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      const result = await markWorkspaceMissedCallResolved(callId);
      if (result.ok) router.refresh();
    });
  };

  if (variant === "compact") {
    return (
      <button
        type="button"
        disabled={pending}
        title={pending ? "Saving…" : "Mark resolved"}
        aria-label={pending ? "Saving resolved state" : "Mark missed call resolved"}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          run();
        }}
        className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-600 shadow-sm transition hover:border-sky-200 hover:bg-sky-50 hover:text-slate-900 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
      >
        <CheckCircle2 className="h-[18px] w-[18px]" strokeWidth={2} aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={run}
      className="inline-flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl border border-sky-200/90 bg-white px-3 py-2.5 text-sm font-semibold text-phone-ink shadow-sm transition hover:bg-phone-ice active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[10rem]"
    >
      <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={2} aria-hidden />
      {pending ? "Saving…" : "Mark resolved"}
    </button>
  );
}
