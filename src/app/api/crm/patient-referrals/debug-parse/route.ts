import { NextResponse } from "next/server";

import { extractPatientReferralPdfText } from "@/lib/crm/patient-referral/pdf-text-extract";
import { parsePatientReferralText } from "@/lib/crm/patient-referral/parse-heuristics";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

/**
 * Direct diagnostics endpoint for the Quick Drop Referral pipeline.
 *
 * Proves, in the deployed runtime, whether the uploaded PDF bytes actually
 * reach the server and whether text extraction works — independent of the
 * queue UI. Access: manager+ session, or an `x-debug-token` matching
 * PATIENT_REFERRAL_PARSE_DEBUG_TOKEN (set this temporarily to test via curl).
 */
export async function POST(req: Request) {
  const debugToken = process.env.PATIENT_REFERRAL_PARSE_DEBUG_TOKEN?.trim();
  const headerToken = req.headers.get("x-debug-token")?.trim();
  const tokenOk = Boolean(debugToken) && headerToken === debugToken;

  if (!tokenOk) {
    const staff = await getStaffProfile();
    if (!staff || !isManagerOrHigher(staff)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const formData = (await req.formData().catch(() => null)) as globalThis.FormData | null;
  if (!formData) {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const entry = formData.get("file");
  if (!entry || typeof entry === "string" || !(entry instanceof Blob)) {
    return NextResponse.json({ error: "No file in form data" }, { status: 400 });
  }

  const fileName = entry instanceof File && entry.name ? entry.name : "referral.pdf";
  const clientFileSizeRaw = formData.get("client_file_size");
  const clientFileSize =
    typeof clientFileSizeRaw === "string" && clientFileSizeRaw ? Number(clientFileSizeRaw) : null;
  const clientFileType =
    entry instanceof File && entry.type ? entry.type : null;

  const arrayBuffer = await entry.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const startsWithPdf = buffer.length >= 4 && buffer.toString("utf8", 0, 4) === "%PDF";

  const base = {
    runtime: `node ${process.version}`,
    fileName,
    clientFileSize,
    clientFileType,
    serverFileSize: entry.size,
    arrayBufferByteLength: arrayBuffer.byteLength,
    bufferLength: buffer.length,
    first20Bytes: buffer.subarray(0, 20).toString("hex"),
    startsWithPdf,
  };

  if (!startsWithPdf || buffer.length <= 0) {
    return NextResponse.json({
      ...base,
      error: "Uploaded file did not reach server as a valid PDF",
      extractedTextLength: 0,
      extractedTextPreview: "",
      parserResult: null,
      parserErrors: ["buffer empty or missing %PDF header"],
    });
  }

  const extract = await extractPatientReferralPdfText(buffer);
  const parserErrors: string[] = [];
  if (extract.pdfParseError) parserErrors.push(`pdf-parse: ${extract.pdfParseError}`);
  if (extract.pdfjsError) parserErrors.push(`pdfjs: ${extract.pdfjsError}`);

  let parserResult: unknown = null;
  try {
    if (extract.text.length >= 50) {
      const parsed = await parsePatientReferralText(extract.text, {
        referralSourceType:
          typeof formData.get("referral_source_type") === "string"
            ? (formData.get("referral_source_type") as string)
            : null,
        useAi: false,
      });
      parserResult = parsed.suggestions;
    }
  } catch (e) {
    parserErrors.push(`parser: ${e instanceof Error ? e.message : String(e)}`);
  }

  return NextResponse.json({
    ...base,
    pdfExtractMethod: extract.method,
    pdfParseTextLength: extract.pdfParseTextLength,
    pdfjsTextLength: extract.pdfjsTextLength,
    extractedTextLength: extract.text.length,
    extractedTextPreview: extract.text.slice(0, 500),
    parserResult,
    parserErrors,
  });
}
