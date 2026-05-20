"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { EyeOff } from "lucide-react";

import { hidePhoneCallFromDispatch } from "../actions";

type Props = {
  callId: string;
};

export function WorkspaceHideCallButton({ callId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = () => {
    if (
      !window.confirm(
        "Hide this call from the Dispatch call log? The record stays in the database; only the list view hides it."
      )
    ) {
      return;
    }
    startTransition(async () => {
      const result = await hidePhoneCallFromDispatch(callId);
      if (result.ok) router.refresh();
    });
  };

  return (
    <button
      type="button"
      disabled={pending}
      title={pending ? "Hiding…" : "Hide from call log"}
      aria-label={pending ? "Hiding call from log" : "Hide call from Dispatch log"}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        run();
      }}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200/90 bg-white text-slate-500 shadow-sm transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-900 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <EyeOff className="h-[17px] w-[17px]" strokeWidth={2} aria-hidden />
    </button>
  );
}
