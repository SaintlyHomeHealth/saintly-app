import Link from "next/link";

import { supabaseAdmin } from "@/lib/admin";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { hasPdfSignCrmLinkage } from "@/lib/pdf-sign/crm-link-display";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { redirect, notFound } from "next/navigation";

import { PacketDetailActions } from "./PacketDetailActions";

type PacketRow = {
  id: string;
  status: string;
  primary_document_type: string;
  crm_entity_type: string;
  crm_entity_id: string;
  created_at: string | null;
  updated_at: string | null;
  expires_at: string | null;
  completed_at: string | null;
  metadata: Record<string, unknown> | null;
  signature_recipients: Array<{
    email: string;
    display_name: string | null;
    last_viewed_at: string | null;
  }> | null;
  signature_packet_documents: Array<{
    id: string;
    template_id: string;
    completed_storage_bucket: string | null;
    completed_storage_path: string | null;
    signature_templates: { name: string; document_type: string } | null;
  }> | null;
};

const DOC_LABEL: Record<string, string> = {
  generic_contract: "Contract / agreement",
  w9: "W-9",
  i9: "I-9",
};

function humanDocType(snake: string | undefined) {
  if (!snake) return "—";
  return DOC_LABEL[snake] || snake.replace(/_/g, " ");
}

function statusBadgeClasses(status: string) {
  switch (status) {
    case "draft":
      return "bg-slate-100 text-slate-700 ring-slate-200/80";
    case "sent":
      return "bg-sky-100 text-sky-900 ring-sky-200/80";
    case "viewed":
      return "bg-amber-100 text-amber-900 ring-amber-200/80";
    case "in_progress":
      return "bg-amber-50 text-amber-900 ring-amber-100";
    case "signed":
    case "completed":
      return "bg-emerald-100 text-emerald-900 ring-emerald-200/80";
    case "expired":
      return "bg-orange-50 text-orange-900 ring-orange-200/70";
    case "voided":
      return "bg-rose-100 text-rose-900 ring-rose-200/80";
    case "canceled":
      return "bg-rose-50 text-rose-950 ring-rose-300/90";
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200/80";
  }
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
}

function linkedCrmTypeLabel(entityType: string) {
  switch (entityType) {
    case "applicant":
      return "Applicant / employee";
    case "lead":
      return "Lead";
    case "contact":
      return "Patient / contact";
    case "vendor":
      return "Vendor / other";
    default:
      return entityType.replace(/_/g, " ");
  }
}

export default async function PacketDetailPage({ params }: { params: Promise<{ packetId: string }> }) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }
  const { packetId } = await params;
  if (!packetId) notFound();

  const { data, error } = await supabaseAdmin
    .from("signature_packets")
    .select(
      `
      id,
      status,
      primary_document_type,
      crm_entity_type,
      crm_entity_id,
      created_at,
      updated_at,
      expires_at,
      completed_at,
      metadata,
      signature_recipients ( email, display_name, last_viewed_at ),
      signature_packet_documents (
        id,
        template_id,
        completed_storage_bucket,
        completed_storage_path,
        signature_templates ( name, document_type )
      )
    `
    )
    .eq("id", packetId)
    .maybeSingle();

  if (error || !data) {
    notFound();
  }

  const row = data as PacketRow;
  const recipient = row.signature_recipients?.[0];
  const doc = row.signature_packet_documents?.[0];
  const tpl = doc?.signature_templates;
  const meta = row.metadata || {};
  const message = typeof meta.message === "string" ? meta.message : null;
  const invitationReplyTo =
    typeof meta.pdf_sign_from_email === "string" && meta.pdf_sign_from_email.includes("@")
      ? meta.pdf_sign_from_email.trim().toLowerCase()
      : null;
  const hasCompletedPdfFile = Boolean(doc?.completed_storage_path?.trim());
  const crmLinked = hasPdfSignCrmLinkage(row.crm_entity_id);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40">
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <Link
          href="/admin/signatures/packets"
          className="text-xs font-semibold uppercase tracking-wide text-sky-800/90 hover:underline"
        >
          ← Sent packets
        </Link>

        <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Packet details</h1>
            <p className="mt-1 text-sm text-slate-600">Status and downloads for this signature request.</p>
          </div>
          <span
            className={
              "inline-flex rounded-full px-3 py-1 text-xs font-semibold capitalize ring-1 ring-inset " +
              statusBadgeClasses(row.status)
            }
          >
            {formatStatus(row.status)}
          </span>
        </div>

        <details className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-3 text-xs">
          <summary className="cursor-pointer font-semibold text-slate-600">Admin · technical details</summary>
          <dl className="mt-3 space-y-2 font-mono text-[11px] text-slate-600">
            <div>
              <dt className="inline text-slate-500">Packet: </dt>
              <dd className="inline break-all">{row.id}</dd>
            </div>
            {doc?.template_id ? (
              <div>
                <dt className="inline text-slate-500">Template: </dt>
                <dd className="inline break-all">{doc.template_id}</dd>
              </div>
            ) : null}
            {crmLinked ? (
              <div>
                <dt className="inline text-slate-500">Linked profile id: </dt>
                <dd className="inline break-all">{row.crm_entity_id}</dd>
              </div>
            ) : null}
          </dl>
        </details>

        <dl className="mt-8 space-y-0 overflow-hidden rounded-2xl border border-slate-200/90 bg-white text-sm shadow-md shadow-slate-200/40">
          <div className="flex flex-wrap justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <dt className="text-slate-500">Template</dt>
            <dd className="text-right font-medium text-slate-900">
              {tpl ? (
                <>
                  {tpl.name}
                  <span className="ml-2 text-xs font-normal text-slate-500">
                    ({humanDocType(tpl.document_type)})
                  </span>
                </>
              ) : (
                <span className="text-sm font-normal text-slate-600">Linked template name not loaded — see admin details.</span>
              )}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <dt className="text-slate-500">Document type</dt>
            <dd className="text-slate-900">{humanDocType(row.primary_document_type)}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <dt className="text-slate-500">Recipient</dt>
            <dd className="text-right">
              {recipient?.display_name ? (
                <span className="font-medium text-slate-900">{recipient.display_name}</span>
              ) : null}
              {recipient?.email ? <div className="text-slate-700">{recipient.email}</div> : "—"}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <dt className="text-slate-500">Invitation email (Reply-To)</dt>
            <dd className="max-w-xl text-right text-slate-900">
              {invitationReplyTo ? (
                <span className="font-mono text-sm">{invitationReplyTo}</span>
              ) : (
                <span className="text-sm text-slate-500">Not recorded (defaults apply)</span>
              )}
              <div className="mt-1 text-xs text-slate-500">
                Stored when the packet was sent. Messages use Saintly&apos;s verified sender;
                signer replies route to this address.
              </div>
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <dt className="text-slate-500">CRM / profile</dt>
            <dd className="max-w-xl text-right text-slate-900">
              {crmLinked ? (
                <>
                  <div className="font-medium">{linkedCrmTypeLabel(row.crm_entity_type)}</div>
                  <div className="mt-1 break-all text-xs text-slate-600">{row.crm_entity_id}</div>
                </>
              ) : (
                <>
                  <div className="font-medium">Manual send</div>
                  <div className="mt-1 text-sm text-slate-600">Not attached to a CRM record</div>
                </>
              )}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <dt className="text-slate-500">Sent</dt>
            <dd className="text-slate-900">{row.created_at ? formatAppDateTime(row.created_at) : "—"}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <dt className="text-slate-500">Expires</dt>
            <dd className="text-slate-900">{row.expires_at ? formatAppDateTime(row.expires_at) : "—"}</dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3 border-b border-slate-100 px-5 py-4">
            <dt className="text-slate-500">Viewed</dt>
            <dd className="text-slate-900">
              {recipient?.last_viewed_at ? formatAppDateTime(recipient.last_viewed_at) : "—"}
            </dd>
          </div>
          <div className="flex flex-wrap justify-between gap-3 px-5 py-4">
            <dt className="text-slate-500">Completed</dt>
            <dd className="text-slate-900">{row.completed_at ? formatAppDateTime(row.completed_at) : "—"}</dd>
          </div>
          {message ? (
            <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-4">
              <dt className="text-slate-500">Message to signer</dt>
              <dd className="mt-2 whitespace-pre-wrap text-slate-800">{message}</dd>
            </div>
          ) : null}
        </dl>

        <PacketDetailActions
          packetId={row.id}
          status={row.status}
          completedDocId={doc?.id ?? null}
          hasCompletedPdfFile={hasCompletedPdfFile}
        />
      </main>
    </div>
  );
}
