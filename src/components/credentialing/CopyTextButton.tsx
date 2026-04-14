"use client";

import { useState } from "react";

export function CopyTextButton({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [state, setState] = useState<"idle" | "ok" | "err">("idle");

  async function copy() {
    const t = text.trim();
    if (!t) return;
    try {
      await navigator.clipboard.writeText(t);
      setState("ok");
      window.setTimeout(() => setState("idle"), 1600);
    } catch {
      setState("err");
      window.setTimeout(() => setState("idle"), 2000);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className={`rounded-md border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 shadow-sm hover:bg-slate-50 ${className}`}
      title={`Copy ${label}`}
    >
      {state === "ok" ? "Copied" : state === "err" ? "Failed" : label}
    </button>
  );
}
