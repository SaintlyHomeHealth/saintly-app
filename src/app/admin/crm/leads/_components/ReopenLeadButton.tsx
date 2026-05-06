"use client";

import { useTransition } from "react";

import { reopenLeadFromDead } from "@/app/admin/crm/actions";

export function ReopenLeadButton(props: { leadId: string }) {
  const { leadId } = props;
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={pending}
      className="rounded-lg border border-sky-700 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
      onClick={() => {
        startTransition(async () => {
          const fd = new FormData();
          fd.append("leadId", leadId);
          await reopenLeadFromDead(fd);
        });
      }}
    >
      {pending ? "Reopening…" : "Reopen lead"}
    </button>
  );
}
