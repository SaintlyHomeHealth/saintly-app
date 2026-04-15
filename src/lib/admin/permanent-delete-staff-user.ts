import { supabaseAdmin } from "@/lib/admin";

const APPLICANT_FILES_BUCKET = "applicant-files";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Best-effort removal of objects in `applicant-files` for this employee/applicant.
 * DB rows are removed separately (applicants delete + cascades).
 */
export async function removeApplicantFilesFromStorage(applicantId: string): Promise<{
  storagePathsAttempted: number;
  storageErrors: string[];
}> {
  const storageErrors: string[] = [];
  const paths = new Set<string>();

  const { data: files, error: filesErr } = await supabaseAdmin
    .from("applicant_files")
    .select("file_path, storage_path")
    .eq("applicant_id", applicantId);

  if (filesErr) {
    storageErrors.push(`applicant_files list: ${filesErr.message}`);
  } else {
    for (const row of files ?? []) {
      const p = (row as { file_path?: string | null; storage_path?: string | null }).file_path;
      const s = (row as { file_path?: string | null; storage_path?: string | null }).storage_path;
      if (p) paths.add(p);
      if (s) paths.add(s);
    }
  }

  const { data: applicant, error: appErr } = await supabaseAdmin
    .from("applicants")
    .select("auto_insurance_file")
    .eq("id", applicantId)
    .maybeSingle();

  if (appErr) {
    storageErrors.push(`applicants load: ${appErr.message}`);
  } else {
    const aif = (applicant as { auto_insurance_file?: string | null } | null)?.auto_insurance_file;
    if (aif) paths.add(aif);
  }

  const list = [...paths].filter(Boolean);
  for (const batch of chunk(list, 95)) {
    if (batch.length === 0) continue;
    const { error } = await supabaseAdmin.storage.from(APPLICANT_FILES_BUCKET).remove(batch);
    if (error) {
      storageErrors.push(error.message);
    }
  }

  return { storagePathsAttempted: list.length, storageErrors };
}

/**
 * Deletes the applicants row (relies on FK cascades for onboarding, contracts, files metadata, etc.).
 * Call after storage cleanup; returns false if delete failed.
 */
export async function deleteApplicantRecord(applicantId: string): Promise<{
  ok: boolean;
  error: string | null;
}> {
  const { error } = await supabaseAdmin.from("applicants").delete().eq("id", applicantId);
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true, error: null };
}
