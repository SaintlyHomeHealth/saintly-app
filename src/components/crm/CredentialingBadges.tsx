import Link from "next/link";

import {
  contractingBadgeTone,
  contractingStatusLabel,
  credentialingBadgeClass,
  credentialingBadgeTone,
  credentialingStatusLabel,
} from "@/lib/crm/credentialing-command-center";
import {
  CREDENTIALING_PRIORITY_LABELS,
  type CredentialingPriorityValue,
  isCredentialingPriority,
} from "@/lib/crm/credentialing-status-options";

export function CredentialingStatusBadge({ status }: { status: string }) {
  const tone = credentialingBadgeTone(status);
  return (
    <span className={credentialingBadgeClass(tone)} title="Credentialing status">
      {credentialingStatusLabel(status)}
    </span>
  );
}

export function ContractingStatusBadge({ status }: { status: string }) {
  const tone = contractingBadgeTone(status);
  return (
    <span className={credentialingBadgeClass(tone)} title="Contracting status">
      {contractingStatusLabel(status)}
    </span>
  );
}

const attentionBase =
  "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide";

export function RowAttentionHint({ title }: { title: string }) {
  return (
    <span
      className={`${attentionBase} border-amber-200 bg-amber-50/90 text-amber-900`}
      title={title}
    >
      Attention
    </span>
  );
}

export function DocsMissingHint({ missing, total }: { missing: number; total: number }) {
  if (total <= 0) return <span className="text-xs text-slate-400">—</span>;
  if (missing <= 0) {
    return (
      <span
        className="inline-flex items-center rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-900"
        title="All tracked documents uploaded or marked N/A"
      >
        Complete
      </span>
    );
  }
  return (
    <span
      className={`${attentionBase} border-violet-200 bg-violet-50 text-violet-900`}
      title={`${missing} document(s) still missing`}
    >
      Docs {total - missing}/{total}
    </span>
  );
}

const docLinkBase =
  "inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-bold transition hover:-translate-y-px";

/** Opens payer detail scrolled to structured checklist; green = complete, red = gaps. */
export function CredentialingDocsChecklistLink({
  recordId,
  missing,
  total,
}: {
  recordId: string;
  missing: number;
  total: number;
}) {
  if (total <= 0) return <span className="text-xs text-slate-400">—</span>;
  const href = `/admin/credentialing/${recordId}#credentialing-checklist`;
  if (missing <= 0) {
    return (
      <Link
        href={href}
        className={`${docLinkBase} border-emerald-300 bg-emerald-50 text-emerald-950 hover:bg-emerald-100`}
        title="All checklist items done — open documents section"
      >
        ✓ {total}/{total}
      </Link>
    );
  }
  return (
    <Link
      href={href}
      className={`${docLinkBase} border-red-300 bg-red-50 text-red-950 hover:bg-red-100`}
      title={`${missing} missing — jump to checklist`}
    >
      {total - missing}/{total} missing
    </Link>
  );
}

export function CredentialingPriorityBadge({ priority }: { priority: string }) {
  const p = isCredentialingPriority(priority) ? priority : "medium";
  const label = CREDENTIALING_PRIORITY_LABELS[p as CredentialingPriorityValue];
  const cls =
    p === "high"
      ? "border-rose-300 bg-rose-50 text-rose-950"
      : p === "low"
        ? "border-slate-200 bg-slate-100 text-slate-600"
        : "border-amber-200 bg-amber-50 text-amber-950";
  return (
    <span className={`${attentionBase} ${cls}`} title="Business priority">
      {label}
    </span>
  );
}

export function ReadyToBillBadge() {
  return (
    <span
      className={`${attentionBase} border-emerald-400 bg-emerald-100 text-emerald-950`}
      title="Enrolled + contracted — ready to bill"
    >
      Ready to bill
    </span>
  );
}
