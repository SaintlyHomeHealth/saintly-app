import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

type ApplicantRow = {
  id: string;
  created_at?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  position?: string | null;
  emr?: string | null;
  license_number?: string | null;
  years_experience?: string | null;
  preferred_shift?: string | null;
  available_start_date?: string | null;
  driver?: string | null;
  has_medicare_experience?: string | null;
  eligibility_to_work?: string | null;
};

type DocumentRow = {
  id: string;
  applicant_id: string;
  document_type: string | null;
  file_url: string | null;
  created_at: string | null;
};

type ContractRow = {
  applicant_id: string;
  selected_role: string | null;
  role_title: string | null;
  role_description: string | null;
  handbook_acknowledged: boolean | null;
  job_description_acknowledged: boolean | null;
  policies_acknowledged: boolean | null;
  electronic_signature: string | null;
  signed_at: string | null;
  completed: boolean | null;
};

type TrainingRow = {
  applicant_id: string;
  module_key: string;
  module_title: string | null;
  is_completed: boolean | null;
  completed_at: string | null;
};

type ApplicantFileRow = {
  id: string;
  applicant_id: string;
  document_type: string | null;
  display_name?: string | null;
  file_name?: string | null;
  file_path?: string | null;
  storage_path?: string | null;
  file_type?: string | null;
  created_at?: string | null;
};

type ComplianceEventRow = {
  id: string;
  event_type?: string | null;
  event_title?: string | null;
  status?: string | null;
  due_date?: string | null;
  completed_at?: string | null;
  created_at?: string | null;
};

type AdminFormRow = {
  id: string;
  employee_id: string;
  form_type?: string | null;
  status?: string | null;
  compliance_event_id?: string | null;
  finalized_at?: string | null;
  updated_at?: string | null;
  created_at?: string | null;
  form_data?: Record<string, unknown> | null;
};

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function parseRoleDescription(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item));
    }
    return [String(parsed)];
  } catch {
    return [String(value)];
  }
}

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._ -]/g, "_").replace(/\s+/g, " ").trim();
}

function getFileExtension(
  fileName?: string | null,
  filePath?: string | null,
  contentType?: string | null
) {
  const fromName = fileName?.split(".").pop()?.toLowerCase();
  if (fromName && fromName.length <= 6) return fromName;

  const fromPath = filePath?.split(".").pop()?.toLowerCase();
  if (fromPath && fromPath.length <= 6) return fromPath;

  if (contentType === "application/pdf") return "pdf";
  if (contentType === "image/jpeg") return "jpg";
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "bin";
}

function getDocumentLabel(documentType: string | null | undefined) {
  const normalized = String(documentType || "").toLowerCase().trim();
  switch (normalized) {
    case "drivers_license":
      return "Driver License";
    case "cpr_card":
    case "cpr_front":
      return "CPR Card";
    case "fingerprint_clearance_card":
      return "Fingerprint Clearance Card";
    case "auto_insurance":
      return "Auto Insurance";
    case "independent_contractor_insurance":
      return "Independent Contractor Insurance";
    case "oig_check":
      return "OIG Check";
    case "background_check":
      return "Background Check";
    case "tb_upload":
    case "tb_test":
      return "TB Upload";
    default:
      return "Uploaded Document";
  }
}

function normalizePacketUploadType(documentType: string | null | undefined) {
  const normalized = String(documentType || "").toLowerCase().trim();
  if (normalized === "tb_test") return "tb_upload";
  if (normalized === "cpr_front") return "cpr_card";
  return normalized;
}

function normalizeCredentialTypeKey(type: string | null | undefined): string {
  const t = (type || "").toLowerCase().trim();
  if (t === "cpr" || t === "cpr_card" || t === "cpr_bls" || t === "bls_cpr") {
    return "cpr";
  }
  if (
    t === "fingerprint_clearance_card" ||
    t === "fingerprint_card" ||
    t === "az_fingerprint_clearance_card"
  ) {
    return "fingerprint_clearance_card";
  }
  if (t === "insurance") {
    return "independent_contractor_insurance";
  }
  return t;
}

function normalizeDocumentTypeLookupKey(type: string | null | undefined): string {
  return normalizeCredentialTypeKey(type).replace(/[\s-]+/g, "_");
}

function getLatestApplicantFile(
  files: Array<{ document_type?: string | null }>,
  documentType: string
) {
  const targetType = normalizeDocumentTypeLookupKey(documentType);
  return (
    files.find(
      (file) => normalizeDocumentTypeLookupKey(file.document_type) === targetType
    ) || null
  );
}

function getStorageObjectFromPublicUrl(fileUrl?: string | null) {
  if (!fileUrl) return null;
  const match = fileUrl.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/);
  if (!match?.[1] || !match?.[2]) return null;
  return {
    bucket: decodeURIComponent(match[1]),
    path: decodeURIComponent(match[2]),
  };
}

function getSortableTimestamp(value?: string | null) {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function getLatestByDocumentType(files: ApplicantFileRow[]) {
  const latest = new Map<string, ApplicantFileRow>();

  for (const file of files) {
    const rawType = String(file.document_type || "").toLowerCase().trim();
    if (!rawType) continue;

    const normalizedType = normalizePacketUploadType(rawType);
    const existing = latest.get(normalizedType);
    const fileTs = getSortableTimestamp(file.created_at);
    const existingTs = getSortableTimestamp(existing?.created_at);

    if (!existing || fileTs >= existingTs) {
      latest.set(normalizedType, file);
    }
  }

  return latest;
}

async function buildDocumentsArtifactPdf(documentRows: DocumentRow[]) {
  const doc = await PDFDocument.create();
  let page = doc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = height - margin;

  const ensureSpace = (needed = 18) => {
    if (y < margin + needed) {
      page = doc.addPage([612, 792]);
      y = height - margin;
    }
  };

  const drawLine = (text: string, isBold = false, size = 10, indent = 0) => {
    ensureSpace(size + 8);
    const x = margin + indent;
    const maxWidth = width - margin - x;
    const words = text.split(/\s+/);
    let line = "";
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = (isBold ? bold : font).widthOfTextAtSize(testLine, size);
      if (testWidth > maxWidth && line) {
        page.drawText(line, { x, y, size, font: isBold ? bold : font, color: rgb(0.1, 0.1, 0.15) });
        y -= size + 6;
        ensureSpace(size + 8);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x, y, size, font: isBold ? bold : font, color: rgb(0.1, 0.1, 0.15) });
      y -= size + 6;
    }
  };

  drawLine("Documents Artifact", true, 16);
  drawLine(`Included files: ${documentRows.length}`, false, 10);
  y -= 4;

  if (documentRows.length === 0) {
    drawLine("No document records found.");
  } else {
    for (const [index, row] of documentRows.entries()) {
      drawLine(`${index + 1}. ${formatValue(row.document_type)}`, true, 10);
      drawLine(`Uploaded: ${formatDate(row.created_at)}`, false, 9, 12);
      drawLine(`URL: ${formatValue(row.file_url)}`, false, 9, 12);
      y -= 2;
    }
  }

  return new Uint8Array(await doc.save());
}

async function buildFormOutputPdf(
  title: string,
  formData: Record<string, unknown>,
  metadata: Array<{ label: string; value: unknown }>
) {
  const doc = await PDFDocument.create();
  let page = doc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = height - margin;

  const ensureSpace = (needed = 18) => {
    if (y < margin + needed) {
      page = doc.addPage([612, 792]);
      y = height - margin;
    }
  };

  const draw = (text: string, isBold = false, size = 10, indent = 0) => {
    ensureSpace(size + 8);
    const x = margin + indent;
    const maxWidth = width - margin - x;
    const words = text.split(/\s+/);
    let line = "";
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      const testWidth = (isBold ? bold : font).widthOfTextAtSize(testLine, size);
      if (testWidth > maxWidth && line) {
        page.drawText(line, { x, y, size, font: isBold ? bold : font, color: rgb(0.1, 0.1, 0.15) });
        y -= size + 6;
        ensureSpace(size + 8);
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      page.drawText(line, { x, y, size, font: isBold ? bold : font, color: rgb(0.1, 0.1, 0.15) });
      y -= size + 6;
    }
  };

  draw(title, true, 16);
  for (const row of metadata) {
    draw(`${row.label}: ${formatValue(row.value)}`, false, 10);
  }
  y -= 2;

  const sortedEntries = Object.entries(formData || {}).sort(([a], [b]) => a.localeCompare(b));
  if (sortedEntries.length === 0) {
    draw("No form data found.");
  } else {
    for (const [key, value] of sortedEntries) {
      draw(`${key}: ${typeof value === "object" ? JSON.stringify(value) : formatValue(value)}`, false, 9);
    }
  }

  return new Uint8Array(await doc.save());
}

export async function GET(req: NextRequest) {
  try {
    const applicantId = req.nextUrl.searchParams.get("applicantId");

    if (!applicantId) {
      return NextResponse.json(
        { error: "Missing applicantId" },
        { status: 400 }
      );
    }

    const [{ data: applicant, error: applicantError }, { data: documents, error: documentsError }, { data: contracts, error: contractsError }, { data: training, error: trainingError }, { data: applicantFiles, error: applicantFilesError }, { data: complianceEvents, error: complianceEventsError }, { data: adminForms, error: adminFormsError }] =
      await Promise.all([
        supabase.from("applicants").select("*").eq("id", applicantId).maybeSingle(),
        supabase
          .from("documents")
          .select("id, applicant_id, document_type, file_url, created_at")
          .eq("applicant_id", applicantId)
          .order("created_at", { ascending: true }),
        supabase
          .from("onboarding_contracts")
          .select("*")
          .eq("applicant_id", applicantId)
          .maybeSingle(),
        supabase
          .from("onboarding_training_completions")
          .select("applicant_id, module_key, module_title, is_completed, completed_at")
          .eq("applicant_id", applicantId)
          .order("completed_at", { ascending: true }),
        supabase
          .from("applicant_files")
          .select(
            "id, applicant_id, document_type, display_name, file_name, file_path, storage_path, file_type, created_at"
          )
          .eq("applicant_id", applicantId)
          .order("created_at", { ascending: true }),
        supabase
          .from("admin_compliance_events")
          .select("id, event_type, event_title, status, due_date, completed_at, created_at")
          .eq("applicant_id", applicantId)
          .order("due_date", { ascending: false }),
        supabase
          .from("employee_admin_forms")
          .select(
            "id, employee_id, form_type, status, compliance_event_id, finalized_at, updated_at, created_at, form_data"
          )
          .eq("employee_id", applicantId)
          .in("form_type", ["skills_competency", "performance_evaluation"])
          .order("updated_at", { ascending: false })
          .order("created_at", { ascending: false }),
      ]);

    if (applicantError) {
      return NextResponse.json(
        { error: applicantError.message },
        { status: 500 }
      );
    }

    if (documentsError) {
      return NextResponse.json(
        { error: documentsError.message },
        { status: 500 }
      );
    }

    if (contractsError) {
      return NextResponse.json(
        { error: contractsError.message },
        { status: 500 }
      );
    }

    if (trainingError) {
      return NextResponse.json(
        { error: trainingError.message },
        { status: 500 }
      );
    }
    if (applicantFilesError) {
      return NextResponse.json(
        { error: applicantFilesError.message },
        { status: 500 }
      );
    }
    if (complianceEventsError) {
      return NextResponse.json(
        { error: complianceEventsError.message },
        { status: 500 }
      );
    }
    if (adminFormsError) {
      return NextResponse.json(
        { error: adminFormsError.message },
        { status: 500 }
      );
    }

    if (!applicant) {
      return NextResponse.json(
        { error: "Applicant not found" },
        { status: 404 }
      );
    }

    const applicantRow = applicant as ApplicantRow;
    const documentRows = (documents || []) as DocumentRow[];
    const contractRow = (contracts || null) as ContractRow | null;
    const trainingRows = (training || []) as TrainingRow[];
    const applicantFileRows = (applicantFiles || []) as ApplicantFileRow[];
    const complianceEventRows = (complianceEvents || []) as ComplianceEventRow[];
    const adminFormRows = (adminForms || []) as AdminFormRow[];

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 48;
    const lineHeight = 16;
    let y = height - margin;

    const addPage = () => {
      page = pdfDoc.addPage([612, 792]);
      y = height - margin;
    };

    const ensureSpace = (needed = 24) => {
      if (y < margin + needed) addPage();
    };

    const drawTextBlock = (
      text: string,
      opts?: {
        x?: number;
        size?: number;
        bold?: boolean;
        color?: ReturnType<typeof rgb>;
        indent?: number;
      }
    ) => {
      const x = opts?.x ?? margin + (opts?.indent ?? 0);
      const size = opts?.size ?? 10;
      const activeFont = opts?.bold ? boldFont : font;
      const color = opts?.color ?? rgb(0.15, 0.15, 0.2);
      const maxWidth = width - x - margin;
      const words = text.split(/\s+/);
      let line = "";

      for (const word of words) {
        const testLine = line ? `${line} ${word}` : word;
        const testWidth = activeFont.widthOfTextAtSize(testLine, size);

        if (testWidth > maxWidth && line) {
          ensureSpace(size + 8);
          page.drawText(line, {
            x,
            y,
            size,
            font: activeFont,
            color,
          });
          y -= size + 6;
          line = word;
        } else {
          line = testLine;
        }
      }

      if (line) {
        ensureSpace(size + 8);
        page.drawText(line, {
          x,
          y,
          size,
          font: activeFont,
          color,
        });
        y -= size + 6;
      }
    };

    const drawDivider = () => {
      ensureSpace(14);
      page.drawLine({
        start: { x: margin, y },
        end: { x: width - margin, y },
        thickness: 1,
        color: rgb(0.84, 0.88, 0.93),
      });
      y -= 14;
    };

    const drawSectionTitle = (title: string) => {
      ensureSpace(30);
      drawTextBlock(title, {
        size: 14,
        bold: true,
        color: rgb(0.02, 0.39, 0.73),
      });
      y -= 4;
    };

    const drawKeyValue = (label: string, value: unknown) => {
      drawTextBlock(`${label}: ${formatValue(value)}`, { size: 10 });
    };

    drawTextBlock("Saintly Home Health", {
      size: 20,
      bold: true,
      color: rgb(0.02, 0.39, 0.73),
    });
    drawTextBlock("Employee Onboarding Summary", {
      size: 14,
      bold: true,
      color: rgb(0.1, 0.1, 0.15),
    });
    drawTextBlock(`Generated: ${formatDate(new Date().toISOString())}`, {
      size: 10,
    });
    drawTextBlock(`Applicant ID: ${applicantRow.id}`, { size: 10 });
    y -= 8;
    drawDivider();

    drawSectionTitle("1. Applicant Information");
    drawKeyValue("First Name", applicantRow.first_name);
    drawKeyValue("Last Name", applicantRow.last_name);
    drawKeyValue("Email", applicantRow.email);
    drawKeyValue("Phone", applicantRow.phone);
    drawKeyValue("Address", applicantRow.address);
    drawKeyValue("City", applicantRow.city);
    drawKeyValue("State", applicantRow.state);
    drawKeyValue("ZIP", applicantRow.zip);
    drawKeyValue("Position", applicantRow.position);
    drawKeyValue("EMR", applicantRow.emr);
    drawKeyValue("License Number", applicantRow.license_number);
    drawKeyValue("Years Experience", applicantRow.years_experience);
    drawKeyValue("Preferred Shift", applicantRow.preferred_shift);
    drawKeyValue("Available Start Date", applicantRow.available_start_date);
    drawKeyValue("Driver", applicantRow.driver);
    drawKeyValue("Medicare Experience", applicantRow.has_medicare_experience);
    drawKeyValue("Eligibility To Work", applicantRow.eligibility_to_work);
    drawKeyValue("Application Created", formatDate(applicantRow.created_at));
    y -= 8;
    drawDivider();

    drawSectionTitle("2. Uploaded Documents");
    if (documentRows.length === 0) {
      drawTextBlock("No document records found.");
    } else {
      documentRows.forEach((doc, index) => {
        drawTextBlock(`${index + 1}. ${formatValue(doc.document_type)}`, {
          bold: true,
          size: 10,
        });
        drawTextBlock(`URL: ${formatValue(doc.file_url)}`, {
          size: 9,
          indent: 12,
        });
        drawTextBlock(`Uploaded: ${formatDate(doc.created_at)}`, {
          size: 9,
          indent: 12,
        });
        y -= 4;
      });
    }
    drawDivider();

    drawSectionTitle("3. Contracts & Acknowledgments");
    if (!contractRow) {
      drawTextBlock("No contract record found.");
    } else {
      drawKeyValue("Selected Role Key", contractRow.selected_role);
      drawKeyValue("Role Title", contractRow.role_title);
      drawKeyValue(
        "Handbook Acknowledged",
        contractRow.handbook_acknowledged ? "Yes" : "No"
      );
      drawKeyValue(
        "Job Description Acknowledged",
        contractRow.job_description_acknowledged ? "Yes" : "No"
      );
      drawKeyValue(
        "Policies Acknowledged",
        contractRow.policies_acknowledged ? "Yes" : "No"
      );
      drawKeyValue("Electronic Signature", contractRow.electronic_signature);
      drawKeyValue("Signed At", formatDate(contractRow.signed_at));
      drawKeyValue("Contract Complete", contractRow.completed ? "Yes" : "No");

      const roleBullets = parseRoleDescription(contractRow.role_description);
      if (roleBullets.length > 0) {
        y -= 4;
        drawTextBlock("Role Description Snapshot:", { bold: true, size: 10 });
        roleBullets.forEach((bullet) => {
          drawTextBlock(`• ${bullet}`, { size: 9, indent: 12 });
        });
      }
    }
    drawDivider();

    drawSectionTitle("4. Training Completion");
    if (trainingRows.length === 0) {
      drawTextBlock("No training completion records found.");
    } else {
      drawKeyValue(
        "Completed Modules",
        `${trainingRows.filter((row) => row.is_completed).length} of ${trainingRows.length}`
      );
      y -= 4;

      trainingRows.forEach((row, index) => {
        drawTextBlock(
          `${index + 1}. ${formatValue(row.module_title)} ${
            row.is_completed ? "— Complete" : "— Incomplete"
          }`,
          { bold: true, size: 10 }
        );
        drawTextBlock(`Module Key: ${formatValue(row.module_key)}`, {
          size: 9,
          indent: 12,
        });
        drawTextBlock(`Completed At: ${formatDate(row.completed_at)}`, {
          size: 9,
          indent: 12,
        });
        y -= 4;
      });
    }

    const pdfBytes = await pdfDoc.save();

    const safeFirst = (applicantRow.first_name || "applicant").replace(/\s+/g, "-");
    const safeLast = (applicantRow.last_name || "file").replace(/\s+/g, "-");
    const summaryFileName = `00-Summary-${safeFirst}-${safeLast}.pdf`;

    const requiredApplicantFileTypes = new Set([
      "drivers_license",
      "cpr_card",
      "cpr_front",
      "fingerprint_clearance_card",
      "auto_insurance",
      "independent_contractor_insurance",
      "oig_check",
      "background_check",
      "tb_upload",
    ]);

    const zip = new JSZip();
    zip.file(summaryFileName, pdfBytes);
    const addedFileNames = new Set<string>();
    const addZipFile = (preferredName: string, bytes: Uint8Array) => {
      let name = preferredName;
      let counter = 2;
      while (addedFileNames.has(name)) {
        const dotIndex = preferredName.lastIndexOf(".");
        if (dotIndex > 0) {
          const base = preferredName.slice(0, dotIndex);
          const ext = preferredName.slice(dotIndex);
          name = `${base} (${counter})${ext}`;
        } else {
          name = `${preferredName} (${counter})`;
        }
        counter += 1;
      }
      addedFileNames.add(name);
      zip.file(name, bytes);
    };

    const applicantFilesWithUrls = await Promise.all(
      applicantFileRows.map(async (file) => {
        const storagePath = file.file_path || file.storage_path;
        if (!storagePath) {
          return {
            ...file,
            viewUrl: null,
          };
        }
        const { data: signedUrlData } = await supabase.storage
          .from("applicant-files")
          .createSignedUrl(storagePath, 60 * 60);

        return {
          ...file,
          viewUrl: signedUrlData?.signedUrl || null,
        };
      })
    );

    const documentUploadRecords = await Promise.all(
      documentRows.map(async (document) => {
        const storageObject = getStorageObjectFromPublicUrl(document.file_url);
        let viewUrl = document.file_url || null;

        if (storageObject) {
          const { data: signedUrlData } = await supabase.storage
            .from(storageObject.bucket)
            .createSignedUrl(storageObject.path, 60 * 60);

          if (signedUrlData?.signedUrl) {
            viewUrl = signedUrlData.signedUrl;
          } else if (storageObject.bucket !== "applicant-files") {
            const { data: fallbackSignedUrlData } = await supabase.storage
              .from("applicant-files")
              .createSignedUrl(storageObject.path, 60 * 60);
            viewUrl = fallbackSignedUrlData?.signedUrl || viewUrl;
          }
        }

        return {
          document_type: document.document_type,
          display_name:
            document.document_type === "tb_test"
              ? "TB Test Upload"
              : document.document_type === "fingerprint_clearance_card"
                ? "AZ Fingerprint Clearance Card"
                : document.document_type === "drivers_license"
                  ? "Driver's License"
                  : null,
          file_name: null,
          created_at: document.created_at,
          viewUrl,
        };
      })
    );

    const adminUploadRecords = [
      ...applicantFilesWithUrls.map((file) => ({
        document_type: file.document_type,
        display_name: file.display_name,
        file_name: file.file_name,
        created_at: file.created_at,
        viewUrl: file.viewUrl,
      })),
      ...documentUploadRecords,
    ];
    const latestTbTestProof = getLatestApplicantFile(adminUploadRecords, "tb_test") as
      | (typeof adminUploadRecords)[number]
      | null;
    const latestCprProof = getLatestApplicantFile(adminUploadRecords, "cpr_front") as
      | (typeof adminUploadRecords)[number]
      | null;

    const origin = req.nextUrl.origin;
    const forwardCookie = req.headers.get("cookie") || "";
    const generatedPdfArtifacts = [
      { label: "Application", path: `/admin/employees/${applicantId}/employee-file?document=application` },
      {
        label: "Employment Contract",
        path: `/admin/employees/${applicantId}/employee-file?document=employment_contract`,
      },
      { label: "Tax Form", path: `/admin/employees/${applicantId}/employee-file?document=tax` },
      {
        label: "Training Certificate",
        path: `/admin/employees/${applicantId}/employee-file?document=training`,
      },
    ] as const;

    let generatedIndex = 1;
    for (const artifact of generatedPdfArtifacts) {
      const response = await fetch(`${origin}${artifact.path}`, {
        method: "GET",
        headers: {
          cookie: forwardCookie,
        },
        cache: "no-store",
      }).catch(() => null);

      if (!response || !response.ok) continue;
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/pdf")) continue;

      const bytes = new Uint8Array(await response.arrayBuffer());
      addZipFile(`${String(generatedIndex).padStart(2, "0")}-${artifact.label}.pdf`, bytes);
      generatedIndex += 1;
    }

    if (documentRows.length > 0) {
      const documentsPdf = await buildDocumentsArtifactPdf(documentRows);
      addZipFile(`${String(generatedIndex).padStart(2, "0")}-Documents.pdf`, documentsPdf);
      generatedIndex += 1;
    }

    const finalizedSkillsForm =
      adminFormRows.find(
        (form) =>
          (form.form_type || "").toLowerCase().trim() === "skills_competency" &&
          (form.status || "").toLowerCase().trim() === "finalized"
      ) ||
      adminFormRows.find(
        (form) => (form.form_type || "").toLowerCase().trim() === "skills_competency"
      ) ||
      null;
    if (finalizedSkillsForm?.form_data) {
      const skillsPdf = await buildFormOutputPdf(
        "Skills Competency",
        finalizedSkillsForm.form_data,
        [
          { label: "Form ID", value: finalizedSkillsForm.id },
          { label: "Status", value: finalizedSkillsForm.status },
          { label: "Finalized At", value: finalizedSkillsForm.finalized_at },
          { label: "Updated At", value: finalizedSkillsForm.updated_at },
        ]
      );
      addZipFile(`${String(generatedIndex).padStart(2, "0")}-Skills Competency.pdf`, skillsPdf);
      generatedIndex += 1;
    }

    const finalizedPerformanceForm =
      adminFormRows.find(
        (form) =>
          (form.form_type || "").toLowerCase().trim() === "performance_evaluation" &&
          (form.status || "").toLowerCase().trim() === "finalized"
      ) ||
      adminFormRows.find(
        (form) => (form.form_type || "").toLowerCase().trim() === "performance_evaluation"
      ) ||
      null;
    if (finalizedPerformanceForm?.form_data) {
      const performancePdf = await buildFormOutputPdf(
        "Performance Evaluation",
        finalizedPerformanceForm.form_data,
        [
          { label: "Form ID", value: finalizedPerformanceForm.id },
          { label: "Status", value: finalizedPerformanceForm.status },
          { label: "Finalized At", value: finalizedPerformanceForm.finalized_at },
          { label: "Updated At", value: finalizedPerformanceForm.updated_at },
        ]
      );
      addZipFile(
        `${String(generatedIndex).padStart(2, "0")}-Performance Evaluation.pdf`,
        performancePdf
      );
      generatedIndex += 1;
    }

    const latestByType = getLatestByDocumentType(
      applicantFileRows.filter((file) =>
        requiredApplicantFileTypes.has(normalizePacketUploadType(file.document_type))
      )
    );
    const orderedUploadTypes = [
      "drivers_license",
      "cpr_card",
      "fingerprint_clearance_card",
      "auto_insurance",
      "independent_contractor_insurance",
      "oig_check",
      "background_check",
      "tb_upload",
    ] as const;
    const addedUploadTypes = new Set<string>();

    for (const typeKey of orderedUploadTypes) {
      const file = latestByType.get(typeKey);
      if (!file) continue;

      const storagePath = file.file_path || file.storage_path;
      if (!storagePath) continue;

      const { data: downloaded, error: downloadError } = await supabase.storage
        .from("applicant-files")
        .download(storagePath);
      if (downloadError || !downloaded) continue;

      const extension = getFileExtension(
        file.file_name || file.display_name || null,
        storagePath,
        file.file_type || null
      );
      const label = getDocumentLabel(typeKey);
      const baseName = sanitizeFileName(label);
      const fileName = `${String(generatedIndex).padStart(2, "0")}-${baseName}.${extension}`;
      const fileBytes = new Uint8Array(await downloaded.arrayBuffer());
      addZipFile(fileName, fileBytes);
      addedUploadTypes.add(typeKey);
      generatedIndex += 1;
    }

    if (!addedUploadTypes.has("tb_upload") && latestTbTestProof?.viewUrl) {
      const tbFetch = await fetch(latestTbTestProof.viewUrl, { cache: "no-store" }).catch(
        () => null
      );
      if (tbFetch?.ok) {
        const contentType = tbFetch.headers.get("content-type");
        const extension = getFileExtension(
          latestTbTestProof.file_name || latestTbTestProof.display_name || null,
          latestTbTestProof.viewUrl,
          contentType
        );
        const tbBytes = new Uint8Array(await tbFetch.arrayBuffer());
        addZipFile(`${String(generatedIndex).padStart(2, "0")}-TB Upload.${extension}`, tbBytes);
        addedUploadTypes.add("tb_upload");
        generatedIndex += 1;
      }
    }

    if (!addedUploadTypes.has("cpr_card") && latestCprProof?.viewUrl) {
      const cprFetch = await fetch(latestCprProof.viewUrl, { cache: "no-store" }).catch(
        () => null
      );
      if (cprFetch?.ok) {
        const contentType = cprFetch.headers.get("content-type");
        const extension = getFileExtension(
          latestCprProof.file_name || latestCprProof.display_name || null,
          latestCprProof.viewUrl,
          contentType
        );
        const cprBytes = new Uint8Array(await cprFetch.arrayBuffer());
        addZipFile(`${String(generatedIndex).padStart(2, "0")}-CPR Card.${extension}`, cprBytes);
        addedUploadTypes.add("cpr_card");
        generatedIndex += 1;
      }
    }

    const zipBytes = await zip.generateAsync({ type: "uint8array" });
    const responseBody = zipBytes as unknown as BodyInit;
    const zipName = `saintly-onboarding-${safeFirst}-${safeLast}.zip`;

    return new NextResponse(responseBody, {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${zipName}"`,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to generate PDF";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}