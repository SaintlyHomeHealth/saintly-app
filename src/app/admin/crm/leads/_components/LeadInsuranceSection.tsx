"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { uploadLeadInsuranceCard } from "../../actions";

type LeadInsuranceSectionProps = {
  leadId: string;
  primaryPath: string | null;
  secondaryPath: string | null;
  primaryViewUrl: string | null;
  secondaryViewUrl: string | null;
};

const uploadBtnCls =
  "inline-flex cursor-pointer items-center justify-center rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm hover:bg-slate-50 disabled:opacity-50";

const linkCls =
  "inline-flex items-center rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-900 hover:bg-sky-100";

function InsuranceSlot({
  label,
  leadId,
  slot,
  path,
  viewUrl,
}: {
  label: string;
  leadId: string;
  slot: "primary" | "secondary";
  path: string | null;
  viewUrl: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const inputId = `insurance-${slot}-${leadId}`;

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/80 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {path && viewUrl ? (
          <a href={viewUrl} target="_blank" rel="noopener noreferrer" className={linkCls}>
            View file
          </a>
        ) : (
          <span className="text-xs text-slate-400">No file yet</span>
        )}
        <div className="inline-flex items-center gap-2">
          <input
            id={inputId}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            disabled={pending}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              const fd = new FormData();
              fd.append("leadId", leadId);
              fd.append("slot", slot);
              fd.append("file", file);
              startTransition(async () => {
                await uploadLeadInsuranceCard(fd);
                router.refresh();
              });
              e.target.value = "";
            }}
          />
          <label htmlFor={inputId} className={uploadBtnCls}>
            {pending ? "Uploading…" : path ? "Replace file" : "Upload"}
          </label>
        </div>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">PDF or image (JPEG, PNG, Webp). Max 10 MB.</p>
    </div>
  );
}

export function LeadInsuranceSection(props: LeadInsuranceSectionProps) {
  const { leadId, primaryPath, secondaryPath, primaryViewUrl, secondaryViewUrl } = props;

  return (
    <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
      <InsuranceSlot
        label="Primary insurance card"
        leadId={leadId}
        slot="primary"
        path={primaryPath}
        viewUrl={primaryViewUrl}
      />
      <InsuranceSlot
        label="Secondary insurance card"
        leadId={leadId}
        slot="secondary"
        path={secondaryPath}
        viewUrl={secondaryViewUrl}
      />
    </div>
  );
}
