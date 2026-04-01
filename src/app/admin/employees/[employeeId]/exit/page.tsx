import Link from "next/link";
import { redirect } from "next/navigation";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { supabase } from "@/lib/supabase";
import { supabaseAdmin } from "@/lib/admin";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";
import { insertAuditLog } from "@/lib/audit-log";

function getExitInterviewPdfPath(employeeId: string) {
  return `exit-interviews/${employeeId}/exit-interview.pdf`;
}

function formatExitLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateValue(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getEmployeeName(employee: {
  first_name?: string | null;
  last_name?: string | null;
}) {
  return `${employee.first_name || ""} ${employee.last_name || ""}`.trim() || "Unknown Employee";
}

export default async function ExitInterviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ employeeId?: string; id?: string }>;
  searchParams?: Promise<{ error?: string }>;
}) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const employeeIdRaw = resolvedParams.employeeId || resolvedParams.id;

  if (!employeeIdRaw) {
    return <div className="p-6">Invalid employee ID</div>;
  }

  const employeeId: string = employeeIdRaw;

  async function saveExitInterview(formData: FormData) {
    "use server";

    const authUser = await getAuthenticatedUser();
    if (!authUser) {
      redirect("/login");
    }

    const staffProfile = await getStaffProfile();
    if (!isAdminOrHigher(staffProfile)) {
      redirect(`/admin/employees/${employeeId}/exit?error=forbidden`);
    }

    const employeeName = String(formData.get("employee_name") || "").trim();
    const title = String(formData.get("title") || "").trim();
    const dateOfHire = String(formData.get("date_of_hire") || "").trim();
    const dateOfResignation = String(formData.get("date_of_resignation") || "").trim();
    const reasonForLeaving = String(formData.get("reason_for_leaving") || "").trim();
    const separationType = String(formData.get("separation_type") || "").trim();
    const rehireEligibleValue = String(formData.get("rehire_eligible") || "").trim();
    const jobMatchDescription = String(formData.get("job_match_description") || "").trim();
    const adequatelyPrepared = String(formData.get("adequately_prepared") || "").trim();
    const preparationHelpfulNotes = String(
      formData.get("preparation_helpful_notes") || ""
    ).trim();
    const likedBest = String(formData.get("liked_best") || "").trim();
    const likedLeast = String(formData.get("liked_least") || "").trim();
    const performanceFeedbackSufficient = String(
      formData.get("performance_feedback_sufficient") || ""
    ).trim();
    const completedBy = String(formData.get("completed_by") || "").trim();
    const completedDate = String(formData.get("completed_date") || "").trim();
    const notCompletedReason = String(formData.get("not_completed_reason") || "").trim();
    const notes = String(formData.get("notes") || "").trim();

    if (
      !employeeName ||
      !title ||
      !dateOfResignation ||
      !reasonForLeaving ||
      !separationType ||
      !rehireEligibleValue ||
      !jobMatchDescription ||
      !adequatelyPrepared ||
      !likedBest ||
      !likedLeast ||
      !performanceFeedbackSufficient ||
      !completedBy ||
      !completedDate
    ) {
      redirect(`/admin/employees/${employeeId}/exit?error=missing`);
    }

    const { data: employee } = await supabase
      .from("applicants")
      .select("id, first_name, last_name, email, position, status, created_at")
      .eq("id", employeeId)
      .maybeSingle();

    if (!employee) {
      redirect(`/admin/employees/${employeeId}/exit?error=missing_employee`);
    }

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

    const ensureSpace = (needed = 28) => {
      if (y < margin + needed) addPage();
    };

    const addLine = (text: string, bold = false, size = 11) => {
      const activeFont = bold ? boldFont : font;
      ensureSpace(size + 10);
      page.drawText(text, {
        x: margin,
        y,
        size,
        font: activeFont,
        color: rgb(0.15, 0.15, 0.2),
        maxWidth: width - margin * 2,
      });
      y -= size + 10;
    };

    const addSection = (titleText: string) => {
      y -= 4;
      addLine(titleText, true, 13);
      y -= 2;
    };

    addLine("Saintly Home Health", true, 20);
    addLine("Employee Exit Interview", true, 14);
    y -= 8;
    addSection("Employee Information");
    addLine(`Employee Name: ${employeeName}`);
    addLine(`Title: ${title}`);
    addLine(`Date of Hire: ${formatDateValue(dateOfHire)}`);
    addLine(`Date of Resignation: ${formatDateValue(dateOfResignation)}`);
    addLine(`Email: ${employee.email || "—"}`);
    addLine(`Position on File: ${employee.position || "—"}`);

    addSection("Separation Details");
    addLine(`Most Important Reason for Leaving: ${formatExitLabel(reasonForLeaving)}`);
    addLine(`Voluntary / Involuntary: ${formatExitLabel(separationType)}`);
    addLine(`Rehire Eligible: ${rehireEligibleValue === "yes" ? "Yes" : "No"}`);

    addSection("Job Experience");
    addLine(
      `Hours / Salary / Job Duties Matched Description: ${jobMatchDescription}`
    );
    addLine(`Adequately Prepared: ${formatExitLabel(adequatelyPrepared)}`);
    addLine(
      `What Could Have Helped Preparation: ${preparationHelpfulNotes || "—"}`
    );
    addLine(`What They Liked Best: ${likedBest}`);
    addLine(`What They Liked Least: ${likedLeast}`);
    addLine(
      `Received Sufficient Performance Information: ${formatExitLabel(
        performanceFeedbackSufficient
      )}`
    );

    addSection("Interview Completion");
    addLine(`Exit Interview Completed By: ${completedBy}`);
    addLine(`Exit Interview Completed Date: ${formatDateValue(completedDate)}`);
    addLine(`Reason Interview Was Not Completed: ${notCompletedReason || "—"}`);

    addSection("Additional Notes");
    addLine(`Notes: ${notes || "—"}`);

    const pdfBytes = await pdfDoc.save();
    const pdfPath = getExitInterviewPdfPath(employeeId);

    const { error: uploadError } = await supabaseAdmin.storage
      .from("applicant-files")
      .upload(pdfPath, Buffer.from(pdfBytes), {
        contentType: "application/pdf",
        upsert: true,
      });

    if (uploadError) {
      redirect(`/admin/employees/${employeeId}/exit?error=upload`);
    }

    const payload = {
      employee_id: employeeId,
      employee_name: employeeName,
      title,
      date_of_hire: dateOfHire || null,
      date_of_resignation: dateOfResignation || null,
      reason_for_leaving: reasonForLeaving,
      separation_type: separationType,
      rehire_eligible: rehireEligibleValue === "yes",
      job_match_description: jobMatchDescription,
      adequately_prepared: adequatelyPrepared,
      preparation_helpful_notes: preparationHelpfulNotes || null,
      liked_best: likedBest,
      liked_least: likedLeast,
      performance_feedback_sufficient: performanceFeedbackSufficient,
      completed_by: completedBy,
      completed_date: completedDate || null,
      not_completed_reason: notCompletedReason || null,
      notes: notes || null,
    };

    const { data: existingInterview } = await supabaseAdmin
      .from("employee_exit_interviews")
      .select("id")
      .eq("employee_id", employeeId)
      .limit(1)
      .maybeSingle();

    if (existingInterview?.id) {
      await supabaseAdmin.from("employee_exit_interviews").update(payload).eq("id", existingInterview.id);
    } else {
      await supabaseAdmin.from("employee_exit_interviews").insert(payload);
    }

    await supabaseAdmin.from("applicants").update({ status: "inactive" }).eq("id", employeeId);

    await insertAuditLog({
      action: "exit_interview_finalize",
      entityType: "applicant",
      entityId: employeeId,
      metadata: {
        exit_interview_row: existingInterview?.id ?? null,
        pdf_path: pdfPath,
        rehire_eligible: rehireEligibleValue === "yes",
      },
    });

    redirect(`/admin/employees/${employeeId}`);
  }

  const { data: employee } = await supabase
    .from("applicants")
    .select("id, first_name, last_name, email, position, status, created_at")
    .eq("id", employeeId)
    .maybeSingle();

  if (!employee) {
    return <div className="p-6">Employee not found</div>;
  }

  const staffProfile = await getStaffProfile();
  const canFinalizeExit = isAdminOrHigher(staffProfile);

  const errorMessage =
    resolvedSearchParams?.error === "missing"
      ? "Please complete the required exit interview fields."
      : resolvedSearchParams?.error === "upload"
        ? "PDF upload failed. Please try again."
        : resolvedSearchParams?.error === "missing_employee"
          ? "Employee record not found."
          : resolvedSearchParams?.error === "forbidden"
            ? "You do not have permission to finalize exit interviews or mark employees inactive. Ask an administrator."
            : "";

  return (
    <main className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-sm">
          <div className="bg-gradient-to-r from-red-50 via-white to-amber-50 p-8">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-2xl">
                <div className="inline-flex items-center rounded-full border border-red-100 bg-white/90 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-red-700 shadow-sm">
                  Exit Interview
                </div>
                <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900">
                  {employee.first_name} {employee.last_name}
                </h1>
                <p className="mt-2 text-lg text-slate-500">{employee.email}</p>
                <p className="mt-5 max-w-2xl text-sm leading-6 text-slate-600">
                  {canFinalizeExit
                    ? "Complete the employee separation form before finalizing inactive status."
                    : "Only admins and super admins can submit the exit interview and set this employee to inactive. Use Back to Employee to return."}
                </p>
              </div>

              <Link
                href={`/admin/employees/${employeeId}`}
                className="inline-flex items-center rounded-[18px] border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Back to Employee
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Exit Interview Form</h2>
          <p className="mt-1 text-sm text-slate-500">
            {canFinalizeExit
              ? "Save the separation details and generate the PDF record for storage."
              : "Submission is limited to admins and super admins. This page is shown for reference only."}
          </p>

          {canFinalizeExit ? (
          <form action={saveExitInterview} className="mt-6 space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Employee Name
                </span>
                <input
                  name="employee_name"
                  required
                  defaultValue={getEmployeeName(employee)}
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Title</span>
                <input
                  name="title"
                  required
                  defaultValue={employee.position || ""}
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Date of Hire
                </span>
                <input
                  type="date"
                  name="date_of_hire"
                  defaultValue={
                    employee.created_at
                      ? new Date(employee.created_at).toISOString().slice(0, 10)
                      : ""
                  }
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Date of Resignation
                </span>
                <input
                  type="date"
                  name="date_of_resignation"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Most Important Reason for Leaving
                </span>
                <select
                  name="reason_for_leaving"
                  required
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select reason
                  </option>
                  <option value="resignation">Resignation</option>
                  <option value="attendance">Attendance</option>
                  <option value="performance">Performance</option>
                  <option value="relocation">Relocation</option>
                  <option value="personal">Personal</option>
                  <option value="compensation">Compensation</option>
                  <option value="hours">Hours</option>
                  <option value="family">Family</option>
                  <option value="other">Other</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Separation Type
                </span>
                <select
                  name="separation_type"
                  required
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select type
                  </option>
                  <option value="voluntary">Voluntary</option>
                  <option value="involuntary">Involuntary</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Rehire Eligible
                </span>
                <select
                  name="rehire_eligible"
                  required
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                  defaultValue=""
                >
                  <option value="" disabled>
                    Select eligibility
                  </option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Did the hours, salary, and job duties match what was described?
                </span>
                <textarea
                  name="job_match_description"
                  rows={3}
                  required
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Was the employee adequately prepared?
                </span>
                <select
                  name="adequately_prepared"
                  required
                  defaultValue=""
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                >
                  <option value="" disabled>
                    Select response
                  </option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="somewhat">Somewhat</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  What could have helped preparation?
                </span>
                <textarea
                  name="preparation_helpful_notes"
                  rows={3}
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  What did they like best?
                </span>
                <textarea
                  name="liked_best"
                  rows={3}
                  required
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  What did they like least?
                </span>
                <textarea
                  name="liked_least"
                  rows={3}
                  required
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Did the employee receive sufficient information about performance?
                </span>
                <select
                  name="performance_feedback_sufficient"
                  required
                  defaultValue=""
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                >
                  <option value="" disabled>
                    Select response
                  </option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                  <option value="somewhat">Somewhat</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Exit Interview Completed By
                </span>
                <input
                  name="completed_by"
                  required
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Exit Interview Completed Date
                </span>
                <input
                  type="date"
                  name="completed_date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                />
              </label>

              <label className="block md:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Reason why exit interview was not completed
                </span>
                <textarea
                  name="not_completed_reason"
                  rows={3}
                  className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                  placeholder="Leave blank if interview was completed"
                />
              </label>

              <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4 md:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                  Current Status
                </p>
                <p className="mt-2 text-sm font-semibold capitalize text-slate-900">
                  {employee.status || "applicant"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Saving this form will set the employee status to inactive.
                </p>
              </div>
            </div>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Notes</span>
              <textarea
                name="notes"
                rows={5}
                className="w-full rounded-[16px] border border-slate-300 px-4 py-3 text-sm outline-none focus:border-red-400"
                placeholder="Optional separation notes for admin staff"
              />
            </label>

            {errorMessage ? (
              <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}

            <div className="flex flex-wrap justify-end gap-3 pt-2">
              <Link
                href={`/admin/employees/${employeeId}`}
                className="rounded-[18px] border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </Link>

              <button
                type="submit"
                className="rounded-[18px] bg-gradient-to-r from-red-600 to-amber-500 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-red-100"
              >
                Save Exit Interview
              </button>
            </div>
          </form>
          ) : (
            <p className="mt-6 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              Your role can open this page, but only admins and super admins can save exit interviews and set
              employees to inactive.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
