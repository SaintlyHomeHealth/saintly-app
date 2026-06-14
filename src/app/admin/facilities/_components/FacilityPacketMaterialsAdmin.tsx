"use client";

import { useCallback, useEffect, useState } from "react";

import type { PacketMaterialRow, PacketType } from "@/lib/crm/facility-packet-types";
import { PACKET_TYPES, PACKET_TYPE_LABELS } from "@/lib/crm/facility-packet-types";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";

type FacilityPacketMaterialsAdminProps = {
  canManage: boolean;
};

export function FacilityPacketMaterialsAdmin({ canManage }: FacilityPacketMaterialsAdminProps) {
  const [materials, setMaterials] = useState<PacketMaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [packetType, setPacketType] = useState<PacketType>("general_agency_packet");
  const [externalUrl, setExternalUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/facilities/packet-materials?all=1");
      const data = (await res.json()) as { ok: boolean; materials?: PacketMaterialRow[] };
      if (!data.ok) {
        setError("Could not load materials.");
        return;
      }
      setMaterials(data.materials ?? []);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createMaterial(e: React.FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError(null);
    try {
      const form = new FormData();
      form.set("name", name.trim());
      form.set("description", description.trim());
      form.set("packet_type", packetType);
      if (externalUrl.trim()) form.set("external_url", externalUrl.trim());
      if (file) form.set("file", file);

      const res = await fetch("/api/facilities/packet-materials/upload", { method: "POST", body: form });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!data.ok) {
        setError(data.error ?? "Could not save material.");
        return;
      }
      setName("");
      setDescription("");
      setExternalUrl("");
      setFile(null);
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function archiveMaterial(id: string) {
    if (!canManage || !confirm("Archive this material?")) return;
    await fetch(`/api/facilities/packet-materials/${id}/archive`, { method: "POST" });
    await load();
  }

  if (!canManage) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
        Materials library is managed by managers and admins.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={(e) => void createMaterial(e)} className="rounded-2xl border border-violet-200 bg-violet-50/30 p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-violet-900">Add packet material</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold uppercase text-slate-500">
            Name
            <input required value={name} onChange={(e) => setName(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
          </label>
          <label className="block text-xs font-semibold uppercase text-slate-500">
            Packet type
            <select value={packetType} onChange={(e) => setPacketType(e.target.value as PacketType)} className={`${crmFilterInputCls} mt-1 w-full`}>
              {PACKET_TYPES.map((t) => (
                <option key={t} value={t}>
                  {PACKET_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs font-semibold uppercase text-slate-500 sm:col-span-2">
            Description
            <input value={description} onChange={(e) => setDescription(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} />
          </label>
          <label className="block text-xs font-semibold uppercase text-slate-500">
            External URL (optional)
            <input value={externalUrl} onChange={(e) => setExternalUrl(e.target.value)} className={`${crmFilterInputCls} mt-1 w-full`} placeholder="https://…" />
          </label>
          <label className="block text-xs font-semibold uppercase text-slate-500">
            PDF / file (optional, max 10 MB)
            <input
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,.docx,application/pdf,image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 block w-full text-sm"
            />
          </label>
        </div>
        {error ? <p className="mt-2 text-sm text-red-700">{error}</p> : null}
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="mt-3 rounded-lg border border-violet-600 bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Add material"}
        </button>
      </form>

      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-slate-800">Materials library</h2>
        {loading ? <p className="mt-3 text-sm text-slate-500">Loading…</p> : null}
        {!loading && materials.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">No materials yet.</p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-100">
            {materials.map((m) => (
              <li key={m.id} className="flex flex-wrap items-start justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold text-slate-900">
                    {m.name}
                    {!m.is_active ? <span className="ml-2 text-xs text-slate-500">(archived)</span> : null}
                  </p>
                  <p className="text-xs text-slate-500">
                    {m.packet_type ? PACKET_TYPE_LABELS[m.packet_type] : "General"}
                    {m.file_name ? ` · ${m.file_name}` : m.external_url ? " · link" : ""}
                  </p>
                  {m.description ? <p className="mt-1 text-sm text-slate-600">{m.description}</p> : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  {m.storage_path || m.external_url ? (
                    <a
                      href={`/api/facilities/packet-materials/${m.id}/file?download=1`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-sky-800"
                    >
                      Download
                    </a>
                  ) : null}
                  {m.is_active ? (
                    <button
                      type="button"
                      onClick={() => void archiveMaterial(m.id)}
                      className="rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-rose-800"
                    >
                      Archive
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
