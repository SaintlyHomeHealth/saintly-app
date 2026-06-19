import { NextResponse } from "next/server";

import { parsePatientReferralDocumentFromFormData } from "@/lib/crm/patient-referral/parse-document";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const formData = (await req.formData().catch(() => null)) as globalThis.FormData | null;
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const clientFileSizeRaw = formData.get("client_file_size");
  const clientFileType = formData.get("client_file_type");
  const clientFileSize =
    typeof clientFileSizeRaw === "string" && clientFileSizeRaw ? Number(clientFileSizeRaw) : null;

  const result = await parsePatientReferralDocumentFromFormData(formData);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // Raw extracted document text is PHI: only include it in the response when an
  // operator explicitly opts in via the server debug flag. The parsed
  // `suggestions` (needed to prefill the form) are always returned.
  const includeRawText = process.env.PATIENT_REFERRAL_PARSE_DEBUG === "1";

  const pd = result.parse.parseDebug ?? null;
  const safeParse = { ...result.parse };
  if (!includeRawText) {
    delete safeParse.textPreview;
    if (safeParse.parseDebug) {
      safeParse.parseDebug = { ...safeParse.parseDebug, textPreview: "" };
    }
  }

  // Concise, non-PHI technical diagnostics are always safe to surface so the
  // live UI can pinpoint the real failure (bytes received, %PDF, engine, etc.).
  return NextResponse.json({
    ok: true,
    file_name: result.file_name,
    referral_source_type: result.referral_source_type,
    parse: safeParse,
    extractedTextLength: result.parse.extractedTextLength ?? 0,
    debug: {
      runtime: pd?.runtime ?? `node ${process.version}`,
      clientFileSize,
      clientFileType: typeof clientFileType === "string" ? clientFileType : null,
      serverFileSize: pd?.fileSize ?? null,
      bufferLength: pd?.bufferLength ?? null,
      startsWithPdf: pd?.startsWithPdf ?? null,
      first20Bytes: pd?.first20Bytes ?? null,
      extractedTextLength: result.parse.extractedTextLength ?? 0,
      pdfExtractMethod: pd?.pdfExtractMethod ?? null,
      pdfParseTextLength: pd?.pdfParseTextLength ?? null,
      pdfjsTextLength: pd?.pdfjsTextLength ?? null,
      pdfParseError: pd?.pdfParseError ?? null,
      pdfjsError: pd?.pdfjsError ?? null,
      ocrAttempted: pd?.ocrAttempted ?? null,
      ocrTextLength: pd?.ocrTextLength ?? null,
      ...(includeRawText ? { textPreview: result.parse.textPreview ?? pd?.textPreview ?? "" } : {}),
    },
  });
}
