"use client";

import { useTransition } from "react";

import { markLeadDead } from "@/app/admin/crm/actions";

/** Must stay outside intake `<form>` submit semantics — implicit Enter must never trigger dead disposition. */
export function MarkLeadDeadButton(props: { leadId: string; className?: string }) {
  const { leadId, className } = props;
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className={className}
      onClick={() => {
        startTransition(async () => {
          const fd = new FormData();
          fd.append("leadId", leadId);
          await markLeadDead(fd);
        });
      }}
    >
      {pending ? "…" : "Mark dead lead"}
    </button>
  );
}
