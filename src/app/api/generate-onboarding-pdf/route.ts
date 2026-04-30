import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import JSZip from "jszip";

import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";
import {
  collectSurveyPacketAttachmentCandidates,
  downloadAttachmentBytesForZip,
  mergeSurveyPacketAttachmentSection,
} from "@/lib/survey-packet/attachments";

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

async function buildComplianceEventsSummaryPdf(
  rows: ComplianceEventRow[]
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  let page = doc.addPage([612, 792]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  let y = 792 - margin;

  const newPage = () => {
    page = doc.addPage([612, 792]);
    y = 792 - margin;
  };

  const draw = (text: string, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? 10;
    if (y < margin + 40) newPage();
    page.drawText(text, {
      x: margin,
      y,
      size,
      font: opts?.bold ? bold : font,
      color: rgb(0.1, 0.1, 0.15),
    });
    y -= size + 8;
  };

  draw("Compliance events", { bold: true, size: 14 });
  draw("Summary of admin_compliance_events for this applicant.", { size: 9 });
  y -= 4;

  if (rows.length === 0) {
    draw("No compliance event records.");
  } else {
    rows.forEach((e, i) => {
      draw(`${i + 1}. ${e.event_title || e.event_type || "Event"}`, { bold: true, size: 11 });
      draw(
        `   Status: ${e.status || "—"}   Due: ${formatDate(e.due_date)}   Completed: ${formatDate(
          e.completed_at
        )}`,
        { size: 9 }
      );
      y -= 6;
    });
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

    const user = await getAuthenticatedUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const staffProfile = await getStaffProfile();
    if (!isAdminOrHigher(staffProfile)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [{ data: applicant, error: applicantError }, { data: documents, error: documentsError }, { data: contracts, error: contractsError }, { data: training, error: trainingError }, { data: complianceEvents, error: complianceEventsError }, { data: adminForms, error: adminFormsError }] =
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
    const complianceEventRows = (complianceEvents || []) as ComplianceEventRow[];
    const adminFormRows = (adminForms || []) as AdminFormRow[];

    const pdfDoc = await PDFDocument.create();
    let page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const margin = 48;
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

    const summaryPdfBytes = new Uint8Array(await pdfDoc.save());
    const { pdfBytes: mergedSummaryBytes } = await mergeSurveyPacketAttachmentSection(
      summaryPdfBytes,
      applicantId
    );

    const safeFirst = (applicantRow.first_name || "applicant").replace(/\s+/g, "-");
    const safeLast = (applicantRow.last_name || "file").replace(/\s+/g, "-");
    const summaryFileName = `00-Summary-${safeFirst}-${safeLast}.pdf`;

    const zip = new JSZip();
    const addedZipPaths = new Set<string>();
    const addZipFile = (folder: string, preferredName: string, bytes: Uint8Array) => {
      let name = preferredName;
      let path = `${folder}/${name}`;
      let counter = 2;
      while (addedZipPaths.has(path)) {
        const dotIndex = preferredName.lastIndexOf(".");
        if (dotIndex > 0) {
          const base = preferredName.slice(0, dotIndex);
          const ext = preferredName.slice(dotIndex);
          name = `${base} (${counter})${ext}`;
        } else {
          name = `${preferredName} (${counter})`;
        }
        path = `${folder}/${name}`;
        counter += 1;
      }
      addedZipPaths.add(path);
      zip.file(path, bytes);
    };

    addZipFile("01-generated-forms", summaryFileName, mergedSummaryBytes);

    const origin = req.nextUrl.origin;
    const forwardCookie = req.headers.get("cookie") || "";

    type GeneratedZipEntry = {
      label: string;
      path: string;
      folder: string;
    };

    const generatedPdfArtifacts: GeneratedZipEntry[] = [
      {
        label: "Application",
        path: `/admin/employees/${applicantId}/employee-file?document=application`,
        folder: "01-generated-forms",
      },
      {
        label: "Employment Contract",
        path: `/admin/employees/${applicantId}/employee-file?document=employment_contract`,
        folder: "05-contracts-tax",
      },
      {
        label: "Tax Form",
        path: `/admin/employees/${applicantId}/employee-file?document=tax`,
        folder: "05-contracts-tax",
      },
      {
        label: "Training Certificate",
        path: `/admin/employees/${applicantId}/employee-file?document=training`,
        folder: "04-training",
      },
    ];

    const nextIndex = (folder: string) => {
      const prefix = `${folder}/`;
      let max = 0;
      for (const p of addedZipPaths) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const m = /^(\d{2})-/.exec(rest);
        if (m) max = Math.max(max, parseInt(m[1], 10));
      }
      return String(max + 1).padStart(2, "0");
    };

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
      const idx = nextIndex(artifact.folder);
      addZipFile(
        artifact.folder,
        `${idx}-${artifact.label.replace(/\s+/g, "-")}.pdf`,
        bytes
      );
    }

    if (documentRows.length > 0) {
      const documentsPdf = await buildDocumentsArtifactPdf(documentRows);
      addZipFile(
        "01-generated-forms",
        `${nextIndex("01-generated-forms")}-Documents-Artifact.pdf`,
        documentsPdf
      );
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
      addZipFile(
        "01-generated-forms",
        `${nextIndex("01-generated-forms")}-Skills-Competency.pdf`,
        skillsPdf
      );
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
        "01-generated-forms",
        `${nextIndex("01-generated-forms")}-Performance-Evaluation.pdf`,
        performancePdf
      );
    }

    const complianceSummaryPdf = await buildComplianceEventsSummaryPdf(complianceEventRows);
    addZipFile(
      "03-compliance-events",
      `${nextIndex("03-compliance-events")}-Compliance-Events-Summary.pdf`,
      complianceSummaryPdf
    );

    const attachmentCandidates = await collectSurveyPacketAttachmentCandidates(applicantId);
    let uploadSeq = 1;
    for (const c of attachmentCandidates) {
      const bytes = await downloadAttachmentBytesForZip(c);
      if (!bytes?.length) continue;
      const ext = getFileExtension(c.fileNameGuess, c.storagePath, c.mimeHint);
      const safeBase = sanitizeFileName(
        `${String(uploadSeq).padStart(2, "0")}-${c.label}-${c.typeLabel}`.replace(
          /\s+/g,
          "-"
        )
      );
      addZipFile("02-uploaded-credentials", `${safeBase}.${ext}`, bytes);
      uploadSeq += 1;
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