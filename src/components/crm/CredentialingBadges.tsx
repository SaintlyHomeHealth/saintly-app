import {
  contractingBadgeTone,
  contractingStatusLabel,
  credentialingBadgeClass,
  credentialingBadgeTone,
  credentialingStatusLabel,
} from "@/lib/crm/credentialing-command-center";

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
