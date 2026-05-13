import Link from "next/link";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";
import { formatAppDateTime } from "@/lib/datetime/app-timezone";
import { redirect } from "next/navigation";

import { PacketRowActions } from "./PacketRowActions";

type PacketListRow = {
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

export default async function AdminPdfSignPacketsPage() {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    redirect("/unauthorized?reason=forbidden");
  }

  const { data: rows, error } = await supabaseAdmin
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
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return (
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <p className="text-sm text-rose-700">Could not load packets: {error.message}</p>
      </main>
    );
  }

  const list = (rows || []) as PacketListRow[];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-sky-50/40">
      <main className="mx-auto w-full max-w-6xl px-4 py-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <Link
              href="/admin/signatures"
              className="text-xs font-semibold uppercase tracking-wide text-sky-800/90 hover:underline"
            >
              ← Saintly PDF Sign
            </Link>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-900">Sent packets</h1>
            <p className="mt-2 max-w-2xl text-slate-600">
              Track signature requests, completion status, and signed PDFs.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 lg:justify-end">
            <Link
              href="/admin/signatures/send"
              className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2.5 text-sm font-semibold text-amber-950 shadow-md shadow-amber-500/20 hover:from-amber-500 hover:to-amber-600"
            >
              Send new packet
            </Link>
            <Link
              href="/admin/signatures/templates"
              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-sky-50/80"
            >
              Manage templates
            </Link>
          </div>
        </div>

        <div className="mt-10 overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-md shadow-slate-200/40">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-slate-100 bg-slate-50/90 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Packet / template</th>
                <th className="px-4 py-3">Recipient</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Sent</th>
                <th className="px-4 py-3">Viewed</th>
                <th className="px-4 py-3">Completed</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {list.map((row) => {
                const recipient = row.signature_recipients?.[0];
                const doc = row.signature_packet_documents?.[0];
                const tplName = doc?.signature_templates?.name;
                const meta = row.metadata;
                const metaTitle =
                  meta &&
                  typeof meta === "object" &&
                  "title" in meta &&
                  typeof (meta as { title?: unknown }).title === "string"
                    ? (meta as { title: string }).title
                    : null;
                const typeLabel = tplName || metaTitle || "Packet";
                const docType = doc?.signature_templates?.document_type ?? row.primary_document_type;
                const docId = doc?.id;
                const hasCompletedPdfFile = Boolean(doc?.completed_storage_path?.trim());
                return (
                  <tr key={row.id} className="bg-white transition hover:bg-sky-50/40">
                    <td className="max-w-[15rem] px-4 py-3">
                      <div className="font-semibold text-slate-900">{typeLabel}</div>
                      <div className="text-xs text-slate-500">{humanDocType(docType)}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-800">
                      <div className="font-medium">{recipient?.display_name || "—"}</div>
                      <div className="text-xs text-slate-600">{recipient?.email || "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ring-1 ring-inset " +
                          statusBadgeClasses(row.status)
                        }
                      >
                        {formatStatus(row.status)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {row.created_at ? formatAppDateTime(row.created_at) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {recipient?.last_viewed_at ? formatAppDateTime(recipient.last_viewed_at) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      {row.completed_at ? formatAppDateTime(row.completed_at) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <PacketRowActions
                        packetId={row.id}
                        status={row.status}
                        documentId={docId}
                        hasCompletedPdfFile={hasCompletedPdfFile}
                      />
                    </td>
                  </tr>
                );
              })}
              {list.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-16 text-center">
                    <p className="text-slate-700">No packets sent yet. Send your first packet.</p>
                    <Link
                      className="mt-3 inline-flex rounded-2xl bg-gradient-to-r from-amber-400 to-amber-500 px-5 py-2 text-sm font-semibold text-amber-950 shadow-md"
                      href="/admin/signatures/send"
                    >
                      Send new packet
                    </Link>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
