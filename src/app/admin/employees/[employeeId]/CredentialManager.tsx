"use client";

import { useEffect, useMemo, useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { getCredentialAnchorId } from "@/lib/credential-anchors";

type CredentialRecord = {
  id: string;
  employee_id: string;
  credential_type: string;
  credential_name: string | null;
  credential_number: string | null;
  issuing_state: string | null;
  issue_date: string | null;
  expiration_date: string | null;
  notes: string | null;
  created_at?: string | null;
  document_url?: string | null;
  document_path?: string | null;
  file_name?: string | null;
  file_type?: string | null;
  uploaded_at?: string | null;
  view_url?: string | null;
};

type Props = {
  employeeId: string;
  initialCredentials: CredentialRecord[];
  /** When false, managers see read-only credential data (add/edit/delete/upload disabled). */
  allowMutations?: boolean;
};

type FormState = {
  id: string | null;
  credential_type: string;
  credential_name: string;
  credential_number: string;
  issuing_state: string;
  issue_date: string;
  expiration_date: string;
  notes: string;
};

const emptyForm: FormState = {
  id: null,
  credential_type: "professional_license",
  credential_name: "",
  credential_number: "",
  issuing_state: "",
  issue_date: "",
  expiration_date: "",
  notes: "",
};

function formatCredentialType(type: string) {
  switch ((type || "").toLowerCase().trim()) {
    case "professional_license":
      return "Professional License";
    case "cpr":
      return "CPR";
    case "insurance":
      return "Liability Insurance";
    case "auto_insurance":
      return "Auto Insurance";
    case "independent_contractor_insurance":
      return "Independent Contractor Insurance";
    case "drivers_license":
      return "Driver’s License";
    case "fingerprint_clearance_card":
      return "AZ Fingerprint Clearance Card";
    case "tb_expiration":
      return "TB Expiration";
    default:
      return type || "Credential";
  }
}

function formatDate(dateString?: string | null) {
  if (!dateString) return "—";

  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(dateString)
    ? `${dateString}T00:00:00`
    : dateString;

  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return dateString;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getDaysRemaining(dateString?: string | null) {
  if (!dateString) return null;

  const today = new Date();
  const expiration = new Date(
    /^\d{4}-\d{2}-\d{2}$/.test(dateString) ? `${dateString}T00:00:00` : dateString
  );

  today.setHours(0, 0, 0, 0);
  expiration.setHours(0, 0, 0, 0);

  if (Number.isNaN(expiration.getTime())) return null;

  const diffMs = expiration.getTime() - today.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getCredentialStatus(dateString?: string | null) {
  const daysRemaining = getDaysRemaining(dateString);

  if (daysRemaining === null) {
    return {
      label: "Unknown",
      badgeClass: "border border-slate-200 bg-slate-50 text-slate-700",
    };
  }

  if (daysRemaining < 0) {
    return {
      label: "Expired",
      badgeClass: "border border-red-200 bg-red-50 text-red-700",
    };
  }

  if (daysRemaining <= 30) {
    return {
      label: "Due Soon",
      badgeClass: "border border-amber-200 bg-amber-50 text-amber-700",
    };
  }

  return {
    label: "Active",
    badgeClass: "border border-green-200 bg-green-50 text-green-700",
  };
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (error && typeof error === "object") {
    const dbError = error as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };

    if (dbError.message) {
      const parts = [dbError.message];
      if (dbError.details) parts.push(dbError.details);
      if (dbError.hint) parts.push(`Hint: ${dbError.hint}`);
      if (dbError.code) parts.push(`Code: ${dbError.code}`);
      return parts.join(" ");
    }
  }

  return fallback;
}

/** Maps Postgres RLS / Supabase permission errors to a short staff-facing message. */
function isPermissionDeniedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as {
    code?: string;
    message?: string;
    statusCode?: string;
  };
  const code = String(e.code || "");
  const msg = String(e.message || "").toLowerCase();
  const status = String(e.statusCode || "");
  return (
    code === "42501" ||
    code === "PGRST301" ||
    status === "403" ||
    msg.includes("row-level security") ||
    msg.includes("violates row-level security") ||
    msg.includes("permission denied") ||
    msg.includes("not authorized")
  );
}

function formatCredentialClientError(error: unknown, fallback: string): string {
  if (isPermissionDeniedError(error)) {
    return "You don’t have permission to do that. Credential records and files are limited by role; ask an admin if this seems wrong.";
  }
  return getErrorMessage(error, fallback);
}

export default function CredentialManager({
  employeeId,
  initialCredentials,
  allowMutations = true,
}: Props) {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [credentials, setCredentials] = useState<CredentialRecord[]>(
    initialCredentials || []
  );
  const [isOpen, setIsOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [deletingCredentialId, setDeletingCredentialId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [signedUrlNotice, setSignedUrlNotice] = useState("");

  useEffect(() => {
    async function loadSignedUrls() {
      setSignedUrlNotice("");
      let permissionBlocked = false;

      const updatedCredentials = await Promise.all(
        (initialCredentials || []).map(async (credential) => {
          if (!credential.document_path) {
            return {
              ...credential,
              view_url: null,
            };
          }

          const { data, error } = await supabase.storage
            .from("employee-credentials")
            .createSignedUrl(credential.document_path, 60 * 60);

          if (error && isPermissionDeniedError(error)) {
            permissionBlocked = true;
          }

          return {
            ...credential,
            view_url: error ? null : data?.signedUrl || null,
          };
        })
      );

      setCredentials(updatedCredentials);
      if (permissionBlocked) {
        setSignedUrlNotice(
          "Some credential files could not be opened (permission denied). If you’re on a manager account, confirm storage access matches your role, or ask an administrator."
        );
      }
    }

    loadSignedUrls();
  }, [initialCredentials, supabase]);

  const summary = useMemo(() => {
    return {
      active: credentials.filter(
        (credential) => getCredentialStatus(credential.expiration_date).label === "Active"
      ).length,
      dueSoon: credentials.filter(
        (credential) => getCredentialStatus(credential.expiration_date).label === "Due Soon"
      ).length,
      expired: credentials.filter(
        (credential) => getCredentialStatus(credential.expiration_date).label === "Expired"
      ).length,
    };
  }, [credentials]);

  const credentialGroups = useMemo(() => {
    const normalizeType = (t?: string | null) => (t || "").toLowerCase().trim();

    const byType = new Map<string, CredentialRecord[]>();

    for (const credential of credentials) {
      const key = normalizeType(credential.credential_type);
      if (!key) continue;
      const existing = byType.get(key);
      if (existing) {
        existing.push(credential);
      } else {
        byType.set(key, [credential]);
      }
    }

    const groups = Array.from(byType.entries()).map(([credentialType, records]) => {
      const sorted = records
        .slice()
        .sort((a, b) => {
          const aTime = new Date(a.uploaded_at || a.created_at || 0).getTime();
          const bTime = new Date(b.uploaded_at || b.created_at || 0).getTime();
          return bTime - aTime;
        });

      return {
        credentialType,
        records: sorted,
        current: sorted[0] || null,
      };
    });

    // Keep the groups stable-ish by sorting by current expiration date.
    return groups
      .filter((g) => g.current)
      .sort((a, b) => (a.current!.expiration_date || "").localeCompare(b.current!.expiration_date || ""));
  }, [credentials]);

  function openAddModal() {
    setForm(emptyForm);
    setSelectedFile(null);
    setErrorMessage("");
    setSuccessMessage("");
    setIsOpen(true);
  }

  function openEditModal(credential: CredentialRecord) {
    setForm({
      id: credential.id,
      credential_type: credential.credential_type || "professional_license",
      credential_name: credential.credential_name || "",
      credential_number: credential.credential_number || "",
      issuing_state: credential.issuing_state || "",
      issue_date: credential.issue_date || "",
      expiration_date: credential.expiration_date || "",
      notes: credential.notes || "",
    });
    setSelectedFile(null);
    setErrorMessage("");
    setSuccessMessage("");
    setIsOpen(true);
  }

  function closeModal() {
    if (saving) return;
    setIsOpen(false);
    setForm(emptyForm);
    setSelectedFile(null);
    setErrorMessage("");
    setSuccessMessage("");
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!allowMutations) {
      setErrorMessage("You do not have permission to change credentials.");
      return;
    }
    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    if (!form.expiration_date) {
      setErrorMessage("Expiration date is required.");
      setSaving(false);
      return;
    }

    if (selectedFile && selectedFile.size > 10 * 1024 * 1024) {
      setErrorMessage("File is too large. Please upload a file under 10 MB.");
      setSaving(false);
      return;
    }

    let uploadedFileMeta: {
      document_url: string | null;
      document_path: string | null;
      file_name: string | null;
      file_type: string | null;
      uploaded_at: string | null;
    } | null = null;

    const existingCredential = form.id
      ? credentials.find((item) => item.id === form.id) || null
      : null;

    let saveStep: string = "init";

    try {
      if (selectedFile) {
        saveStep = "storage.upload";
        const safeType = (form.credential_type || "credential").replace(
          /[^a-z0-9_-]/gi,
          "-"
        );
        const safeFileName = selectedFile.name.replace(/\s+/g, "-");
        const filePath = `${employeeId}/${safeType}/${Date.now()}-${safeFileName}`;

        const uploadResult = await supabase.storage
          .from("employee-credentials")
          .upload(filePath, selectedFile, {
            upsert: true,
          });

        if (uploadResult.error) {
          console.error("[CredentialManager.handleSave] storage.upload failed", {
            step: saveStep,
            message: uploadResult.error.message,
            error: uploadResult.error,
          });
          setErrorMessage(
            formatCredentialClientError(uploadResult.error, "Upload failed.")
          );
          setSaving(false);
          return;
        }

        uploadedFileMeta = {
          document_url: null,
          document_path: filePath,
          file_name: selectedFile.name,
          file_type: selectedFile.type || null,
          uploaded_at: new Date().toISOString(),
        };
      }

      const payload = {
        employee_id: employeeId,
        credential_type: form.credential_type,
        credential_name: form.credential_name || null,
        credential_number: form.credential_number || null,
        issuing_state: form.issuing_state || null,
        issue_date: form.issue_date || null,
        expiration_date: form.expiration_date,
        notes: form.notes || null,
        document_url:
          uploadedFileMeta?.document_url ?? existingCredential?.document_url ?? null,
        document_path:
          uploadedFileMeta?.document_path ?? existingCredential?.document_path ?? null,
        file_name: uploadedFileMeta?.file_name ?? existingCredential?.file_name ?? null,
        file_type: uploadedFileMeta?.file_type ?? existingCredential?.file_type ?? null,
        uploaded_at:
          uploadedFileMeta?.uploaded_at ?? existingCredential?.uploaded_at ?? null,
      };

      if (form.id) {
        saveStep = "db.update";
        const { data, error } = await supabase
          .from("employee_credentials")
          .update(payload)
          .eq("id", form.id)
          .select()
          .single();

        if (error) {
          throw error;
        }

        let nextViewUrl = existingCredential?.view_url ?? null;

        if (uploadedFileMeta?.document_path) {
          saveStep = "storage.createSignedUrl(update)";
          const { data: signedUrlData, error: signError } = await supabase.storage
            .from("employee-credentials")
            .createSignedUrl(uploadedFileMeta.document_path, 60 * 60);

          if (signError) {
            console.error("[CredentialManager.handleSave] createSignedUrl failed", {
              step: saveStep,
              path: uploadedFileMeta.document_path,
              error: signError,
            });
          }

          nextViewUrl = signedUrlData?.signedUrl || null;
        }

        setCredentials((current) =>
          current
            .map((item) =>
              item.id === form.id
                ? ({
                    ...(data as CredentialRecord),
                    view_url: nextViewUrl,
                  } as CredentialRecord)
                : item
            )
            .sort((a, b) =>
              (a.expiration_date || "").localeCompare(b.expiration_date || "")
            )
        );

        setSuccessMessage("Credential updated.");
        setSelectedFile(null);
      } else {
        saveStep = "db.insert";
        const { data, error } = await supabase
          .from("employee_credentials")
          .insert(payload)
          .select()
          .single();

        if (error) {
          throw error;
        }

        let nextViewUrl: string | null = null;

        if (uploadedFileMeta?.document_path) {
          saveStep = "storage.createSignedUrl(insert)";
          const { data: signedUrlData, error: signError } = await supabase.storage
            .from("employee-credentials")
            .createSignedUrl(uploadedFileMeta.document_path, 60 * 60);

          if (signError) {
            console.error("[CredentialManager.handleSave] createSignedUrl failed", {
              step: saveStep,
              path: uploadedFileMeta.document_path,
              error: signError,
            });
          }

          nextViewUrl = signedUrlData?.signedUrl || null;
        }

        setCredentials((current) =>
          [
            ...current,
            {
              ...(data as CredentialRecord),
              view_url: nextViewUrl,
            } as CredentialRecord,
          ].sort((a, b) =>
            (a.expiration_date || "").localeCompare(b.expiration_date || "")
          )
        );

        setSuccessMessage("Credential added.");
        setSelectedFile(null);
      }

      saveStep = "ui.closeModalTimer";
      setTimeout(() => {
        setIsOpen(false);
        setForm(emptyForm);
        setSelectedFile(null);
        setSuccessMessage("");
      }, 500);
    } catch (error: unknown) {
      console.error("[CredentialManager.handleSave] failed", {
        step: saveStep,
        employeeId,
        credentialId: form.id,
        credentialType: form.credential_type,
        error,
      });
      const detail = formatCredentialClientError(error, "Unable to save credential.");
      setErrorMessage(
        isPermissionDeniedError(error) || saveStep === "init"
          ? detail
          : `${detail} (step: ${saveStep})`
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(credential: CredentialRecord) {
    if (!allowMutations) {
      return;
    }
    const credentialLabel =
      credential.credential_name || formatCredentialType(credential.credential_type);

    const confirmed = window.confirm(
      `Delete ${credentialLabel}? This will remove the credential record but keep any uploaded file in storage for now.`
    );

    if (!confirmed) {
      return;
    }

    setDeletingCredentialId(credential.id);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      const { error } = await supabase
        .from("employee_credentials")
        .delete()
        .eq("id", credential.id);

      if (error) {
        throw error;
      }

      setCredentials((current) => current.filter((item) => item.id !== credential.id));
      setSuccessMessage("Credential deleted.");
    } catch (error: unknown) {
      setErrorMessage(formatCredentialClientError(error, "Unable to delete credential."));
    } finally {
      setDeletingCredentialId(null);
    }
  }

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Credential Expiration Tracking
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Professional license, CPR, driver’s license, fingerprint clearance card,
            auto insurance, independent contractor insurance, liability insurance, and TB
            expiration dates are tracked here.
          </p>
          {!allowMutations ? (
            <p className="mt-2 text-xs text-slate-500">
              Only admins and super admins can add, edit, delete, or replace credential documents.
            </p>
          ) : null}
          {signedUrlNotice ? (
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              {signedUrlNotice}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
            Active {summary.active}
          </span>
          <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
            Due Soon {summary.dueSoon}
          </span>
          <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
            Expired {summary.expired}
          </span>

          {allowMutations ? (
            <button
              type="button"
              onClick={openAddModal}
              className="ml-0 inline-flex items-center rounded-[18px] bg-gradient-to-r from-sky-600 to-cyan-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-100 transition hover:-translate-y-0.5 md:ml-2"
            >
              Add Credential
            </button>
          ) : (
            <button
              type="button"
              disabled
              title="Only admins and super admins can add credentials."
              className="ml-0 inline-flex cursor-not-allowed items-center rounded-[18px] border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-400 md:ml-2"
            >
              Add Credential
            </button>
          )}
        </div>
      </div>

      {credentials.length === 0 ? (
        <div className="mt-4 rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          No credential records found.
        </div>
      ) : (
        <div className="mt-6 grid gap-4">
          {credentialGroups.map(({ records, current }) => {
            const credential = current!;
            const daysRemaining = getDaysRemaining(credential.expiration_date);
            const status = getCredentialStatus(credential.expiration_date);

            return (
              <div
                key={credential.id}
                id={getCredentialAnchorId(credential.credential_type)}
                className="rounded-[24px] border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-5"
              >
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      {credential.credential_name ||
                        formatCredentialType(credential.credential_type)}
                    </h3>
                    <p className="mt-1 text-sm text-slate-500">
                      {formatCredentialType(credential.credential_type)}
                      {credential.issuing_state ? ` • ${credential.issuing_state}` : ""}
                      {credential.credential_number
                        ? ` • ${credential.credential_number}`
                        : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-semibold ${status.badgeClass}`}
                    >
                      {status.label}
                    </span>

                    {allowMutations ? (
                      <button
                        type="button"
                        onClick={() => openEditModal(credential)}
                        className="inline-flex items-center rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Edit
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="Only admins and super admins can edit credentials."
                        className="inline-flex cursor-not-allowed items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400"
                      >
                        Edit
                      </button>
                    )}

                    {allowMutations ? (
                      <button
                        type="button"
                        onClick={() => handleDelete(credential)}
                        disabled={deletingCredentialId === credential.id}
                        className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingCredentialId === credential.id ? "Deleting..." : "Delete"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        title="Only admins and super admins can delete credentials."
                        className="inline-flex cursor-not-allowed items-center rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-400"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-4">
                  <div className="rounded-[18px] border border-slate-100 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Expiration Date
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {formatDate(credential.expiration_date)}
                    </p>
                  </div>

                  <div className="rounded-[18px] border border-slate-100 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Days Remaining
                    </p>
                    <p className="mt-2 text-sm font-semibold text-slate-900">
                      {daysRemaining === null
                        ? "—"
                        : daysRemaining < 0
                        ? `${Math.abs(daysRemaining)} days overdue`
                        : `${daysRemaining} days`}
                    </p>
                  </div>

                  <div className="rounded-[18px] border border-slate-100 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Notes
                    </p>
                    <p className="mt-2 text-sm text-slate-700">
                      {credential.notes || "—"}
                    </p>
                  </div>

                  <div className="rounded-[18px] border border-slate-100 bg-white/80 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                      Document
                    </p>
                    <div className="mt-2 text-sm text-slate-700">
                      {credential.view_url ? (
                        <div className="space-y-2">
                          <p className="break-words text-sm text-slate-700">
                            {credential.file_name || "Attached document"}
                          </p>
                          <a
                            href={credential.view_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700 transition hover:bg-sky-100"
                          >
                            View Document
                          </a>
                        </div>
                      ) : (
                        "No file uploaded"
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-5 rounded-[20px] border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-semibold text-slate-900">Version History</h4>
                  </div>

                  <div className="mt-4 space-y-3">
                    {records.map((historyItem, index) => {
                      const isCurrent = index === 0;
                      const versionNumber = records.length - index;

                      return (
                        <div
                          key={historyItem.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                        >
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  Version
                                </p>
                                <p className="mt-1 text-sm font-medium text-slate-900">
                                  {versionNumber}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  Record Type
                                </p>
                                <p className="mt-1 text-sm font-medium text-slate-900">
                                  {formatCredentialType(historyItem.credential_type)}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  Created / Uploaded
                                </p>
                                <p className="mt-1 text-sm font-medium text-slate-900">
                                  {historyItem.uploaded_at
                                    ? formatDate(historyItem.uploaded_at)
                                    : formatDate(historyItem.created_at)}
                                </p>
                              </div>

                              <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                  Current / Superseded
                                </p>
                                <p className="mt-1 text-sm font-medium text-slate-900">
                                  {isCurrent ? (
                                    <span className="rounded-full bg-sky-50 px-3 py-1 text-xs font-semibold text-sky-700">
                                      Current
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                                      Superseded
                                    </span>
                                  )}
                                </p>
                              </div>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {historyItem.view_url ? (
                                <a
                                  href={historyItem.view_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                                >
                                  View File
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="w-full max-w-2xl rounded-[28px] border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">
                  {form.id ? "Edit Credential" : "Add Credential"}
                </h3>
                <p className="mt-1 text-sm text-slate-500">
                  Update expiration details for employee compliance tracking.
                </p>
              </div>

              <button
                type="button"
                onClick={closeModal}
                className="rounded-full border border-slate-200 px-3 py-1 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <form onSubmit={handleSave} className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Upload Credential Document
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                  />
                  <p className="mt-2 text-xs text-slate-500">
                    Upload PDF, JPG, or PNG. Leave blank if no replacement document is
                    needed.
                  </p>
                  {form.id ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Existing file stays attached unless you upload a new one.
                    </p>
                  ) : null}
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Credential Type
                  </span>
                  <select
                    value={form.credential_type}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        credential_type: e.target.value,
                      }))
                    }
                    className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                  >
                    <option value="professional_license">Professional License</option>
                    <option value="cpr">CPR</option>
                    <option value="insurance">Liability Insurance</option>
                    <option value="auto_insurance">Auto Insurance</option>
                    <option value="independent_contractor_insurance">
                      Independent Contractor Insurance
                    </option>
                    <option value="drivers_license">Driver’s License</option>
                    <option value="fingerprint_clearance_card">
                      AZ Fingerprint Clearance Card
                    </option>
                    <option value="tb_expiration">TB Expiration</option>
                  </select>
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Credential Name
                  </span>
                  <input
                    type="text"
                    value={form.credential_name}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        credential_name: e.target.value,
                      }))
                    }
                    placeholder="RN License, CPR / BLS, Driver License..."
                    className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Credential Number
                  </span>
                  <input
                    type="text"
                    value={form.credential_number}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        credential_number: e.target.value,
                      }))
                    }
                    placeholder="Optional"
                    className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Issuing State
                  </span>
                  <input
                    type="text"
                    value={form.issuing_state}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        issuing_state: e.target.value,
                      }))
                    }
                    placeholder="AZ"
                    className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Issue Date
                  </span>
                  <input
                    type="date"
                    value={form.issue_date}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        issue_date: e.target.value,
                      }))
                    }
                    className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                  />
                </label>

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Expiration Date
                  </span>
                  <input
                    type="date"
                    value={form.expiration_date}
                    onChange={(e) =>
                      setForm((current) => ({
                        ...current,
                        expiration_date: e.target.value,
                      }))
                    }
                    className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                    required
                  />
                </label>
              </div>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Notes
                </span>
                <textarea
                  value={form.notes}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      notes: e.target.value,
                    }))
                  }
                  rows={4}
                  placeholder="Optional notes for admin staff"
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-sky-500"
                />
              </label>

              {errorMessage ? (
                <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  {errorMessage}
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-[16px] border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
                  {successMessage}
                </div>
              ) : null}

              <div className="flex flex-wrap justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-[18px] border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-[18px] bg-gradient-to-r from-sky-600 to-cyan-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-sky-100 disabled:opacity-60"
                >
                  {saving ? "Saving..." : form.id ? "Save Changes" : "Add Credential"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
