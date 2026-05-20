import Link from "next/link";

import { supabaseAdmin } from "@/lib/admin";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { redirect, notFound } from "next/navigation";

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
    default:
      return "bg-slate-100 text-slate-600 ring-slate-200/80";
  }
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ");
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
  const canDownload =
    doc?.id && (row.status === "completed" || row.status === "signed");

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
            <p className="mt-1 font-mono text-xs text-slate-400">{row.id}</p>
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
                <span className="font-mono text-xs">{doc?.template_id || "—"}</span>
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
            <dt className="text-slate-500">Linked record</dt>
            <dd className="text-right text-slate-900">
              <div className="capitalize text-slate-700">{row.crm_entity_type.replace(/_/g, " ")}</div>
              <div className="font-mono text-xs text-slate-500">{row.crm_entity_id}</div>
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

        <div className="mt-8 flex flex-wrap gap-3">
          {canDownload ? (
            <a
              className="inline-flex rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-6 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600"
              href={`/api/pdf-sign/admin/download?packetDocumentId=${encodeURIComponent(doc!.id)}`}
            >
              Download signed PDF
            </a>
          ) : (
            <p className="text-sm text-slate-500">The signed PDF will appear here when signing is complete.</p>
          )}
        </div>
      </main>
    </div>
  );
}
