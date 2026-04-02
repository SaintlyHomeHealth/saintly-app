"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import OnboardingApplicantFromQuery from "../../components/OnboardingApplicantFromQuery";
import OnboardingProgressSync from "../../components/OnboardingProgressSync";
import { syncOnboardingProgressForApplicant } from "@/lib/onboarding/sync-progress";
import { supabase } from "@/lib/supabase/client";
import OnboardingApplicantIdentity from "../../components/OnboardingApplicantIdentity";
import { EmploymentClassification } from "@/lib/employee-contracts";
import {
  EmployeeTaxFormRow,
  getTaxFormTypeForClassification,
} from "@/lib/employee-tax-forms";

type CompletionState = {
  step2: boolean;
  step3: boolean;
  step4: boolean;
  step5: boolean;
};

export default function OnboardingCompletePage() {
  const [applicantId, setApplicantId] = useState("");
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<CompletionState>({
    step2: false,
    step3: false,
    step4: false,
    step5: false,
  });
  const [debugMessage, setDebugMessage] = useState("");
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isCreatingComplianceEvents, setIsCreatingComplianceEvents] =
    useState(false);

  const overallComplete =
    status.step2 && status.step3 && status.step4 && status.step5;

  useEffect(() => {
    const id = window.localStorage.getItem("applicantId") || "";
    setApplicantId(id);
  }, []);

  useEffect(() => {
    if (!applicantId) {
      setLoading(false);
      setDebugMessage("No applicantId found in localStorage.");
      return;
    }

    const checkCompletion = async () => {
      setLoading(true);
      setDebugMessage("");

      try {
        const { data: applicantData, error: applicantError } = await supabase
          .from("applicants")
          .select("id")
          .eq("id", applicantId)
          .maybeSingle();

        const { data: filesData, error: filesError } = await supabase
          .from("applicant_files")
          .select("id")
          .eq("applicant_id", applicantId);

        const { data: documentsData, error: documentsError } = await supabase
          .from("documents")
          .select("id")
          .eq("applicant_id", applicantId);

        const step3Complete =
          (filesData?.length || 0) > 0 || (documentsData?.length || 0) > 0;

        const { data: contractData, error: contractError } = await supabase
          .from("onboarding_contracts")
          .select("completed")
          .eq("applicant_id", applicantId)
          .maybeSingle();

        const { data: employeeContractData, error: employeeContractError } = await supabase
          .from("employee_contracts")
          .select("employment_classification")
          .eq("applicant_id", applicantId)
          .eq("is_current", true)
          .maybeSingle<{ employment_classification: EmploymentClassification }>();

        const requiredTaxFormType = getTaxFormTypeForClassification(
          employeeContractData?.employment_classification || null
        );

        const { data: taxFormData, error: taxFormError } = requiredTaxFormType
          ? await supabase
              .from("employee_tax_forms")
              .select("form_status")
              .eq("applicant_id", applicantId)
              .eq("is_current", true)
              .eq("form_type", requiredTaxFormType)
              .maybeSingle<Pick<EmployeeTaxFormRow, "form_status">>()
          : { data: null, error: null };

        const {
          data: trainingCompletionData,
          error: trainingCompletionError,
        } = await supabase
          .from("onboarding_training_completions")
          .select("id")
          .eq("applicant_id", applicantId);

        const {
          data: trainingProgressData,
          error: trainingProgressError,
        } = await supabase
          .from("applicant_training_progress")
          .select("id")
          .eq("applicant_id", applicantId);

        const step5Complete =
          (trainingCompletionData?.length || 0) > 0 ||
          (trainingProgressData?.length || 0) > 0;
        const isRequiredTaxFormComplete =
          !!requiredTaxFormType && taxFormData?.form_status === "completed";

        const nextStatus: CompletionState = {
          step2: !!applicantData,
          step3: step3Complete,
          step4: !!contractData?.completed && isRequiredTaxFormComplete,
          step5: step5Complete,
        };

        setStatus(nextStatus);

        const debugParts = [
          `Applicant ID: ${applicantId}`,
          `Step 2 applicants(id): ${
            applicantError
              ? applicantError.message
              : nextStatus.step2
              ? "FOUND"
              : "NOT FOUND"
          }`,
          `Step 3 applicant_files: ${
            filesError
              ? filesError.message
              : `${filesData?.length || 0} file row(s)`
          }`,
          `Step 3 documents fallback: ${
            documentsError
              ? documentsError.message
              : `${documentsData?.length || 0} document row(s)`
          }`,
          `Step 4 onboarding_contracts: ${
            contractError
              ? contractError.message
              : !!contractData?.completed
              ? "COMPLETE"
              : "NOT COMPLETE"
          }`,
          `Step 4 employee_contracts classification: ${
            employeeContractError
              ? employeeContractError.message
              : employeeContractData?.employment_classification || "NOT FOUND"
          }`,
          `Step 4 employee_tax_forms: ${
            !requiredTaxFormType
              ? "NO CURRENT TAX FORM TYPE"
              : taxFormError
              ? taxFormError.message
              : isRequiredTaxFormComplete
              ? "COMPLETE"
              : "NOT COMPLETE"
          }`,
          `Step 5 onboarding_training_completions: ${
            trainingCompletionError
              ? trainingCompletionError.message
              : `${trainingCompletionData?.length || 0} completion row(s)`
          }`,
          `Step 5 applicant_training_progress fallback: ${
            trainingProgressError
              ? trainingProgressError.message
              : `${trainingProgressData?.length || 0} progress row(s)`
          }`,
        ];

        setDebugMessage(debugParts.join(" | "));

        void syncOnboardingProgressForApplicant(supabase, applicantId, {});
      } catch (error) {
        console.error(error);
        setDebugMessage("Unexpected error while checking completion status.");
      } finally {
        setLoading(false);
      }
    };

    checkCompletion();
  }, [applicantId]);

  useEffect(() => {
    if (!applicantId || !overallComplete || loading || isCreatingComplianceEvents) {
      return;
    }

    const complianceCreatedKey = `compliance_created_${applicantId}`;

    if (window.localStorage.getItem(complianceCreatedKey) === "true") {
      return;
    }

    const createComplianceEvents = async () => {
      setIsCreatingComplianceEvents(true);

      try {
        const response = await fetch("/api/create-compliance-events", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ applicantId }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Failed to create compliance events");
        }

        window.localStorage.setItem(complianceCreatedKey, "true");
      } catch (error) {
        console.error("Failed to auto-create compliance events:", error);
      } finally {
        setIsCreatingComplianceEvents(false);
      }
    };

    createComplianceEvents();
  }, [applicantId, overallComplete, loading, isCreatingComplianceEvents]);

  const handleDownloadPdf = async () => {
    if (!applicantId) return;

    setIsDownloadingPdf(true);

    try {
      const response = await fetch(
        `/api/generate-onboarding-pdf?applicantId=${encodeURIComponent(applicantId)}`
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = url;
      link.download = `saintly-onboarding-${applicantId}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      alert("PDF generation failed. Check the server terminal for details.");
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-slate-50 text-slate-900">
        <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
          <div className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm">
            <div className="animate-pulse space-y-4">
              <div className="h-4 w-44 rounded bg-slate-200" />
              <div className="h-10 w-72 rounded bg-slate-200" />
              <div className="h-24 rounded-2xl bg-slate-100" />
              <div className="h-24 rounded-2xl bg-slate-100" />
              <div className="h-24 rounded-2xl bg-slate-100" />
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <Suspense fallback={null}>
        <OnboardingApplicantFromQuery />
      </Suspense>
      <OnboardingProgressSync />
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex justify-center">
          <div className="rounded-full border border-teal-200 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 shadow-sm">
            Employee Onboarding · Step 6 of 6
          </div>
        </div>

        <OnboardingApplicantIdentity />

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { label: "1. Welcome", href: "/onboarding-welcome", state: "complete" },
            {
              label: "2. Application",
              href: "/onboarding-application",
              state: status.step2 ? "complete" : "upcoming",
            },
            {
              label: "3. Documents",
              href: "/onboarding-documents",
              state: status.step3 ? "complete" : "upcoming",
            },
            {
              label: "4. Contracts",
              href: "/onboarding-contracts",
              state: status.step4 ? "complete" : "upcoming",
            },
            {
              label: "5. Training",
              href: "/onboarding-training",
              state: status.step5 ? "complete" : "upcoming",
            },
            { label: "6. Complete", href: "/onboarding-complete", state: "current" },
          ].map((step) => {
            const isComplete = step.state === "complete";
            const isCurrent = step.state === "current";

            return (
              <Link
                key={step.label}
                href={step.href}
                className={[
                  "flex items-center justify-center rounded-full border px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.1em] transition",
                  isComplete
                    ? "border-teal-600 bg-teal-700 text-white shadow-lg shadow-teal-900/15"
                    : isCurrent
                    ? "border-teal-700 bg-gradient-to-br from-cyan-50 to-white text-slate-900 shadow-lg"
                    : "border-slate-200 bg-white text-slate-400 shadow-sm",
                ].join(" ")}
              >
                {isComplete ? `✓ ${step.label}` : step.label}
              </Link>
            );
          })}
        </div>

        <section className="overflow-hidden rounded-[28px] border border-cyan-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(224,247,244,1)_0%,_rgba(255,255,255,1)_58%)] p-6 shadow-[0_24px_60px_rgba(14,116,144,0.12)] sm:p-8">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.28em] text-teal-700">
              Welcome to Saintly Home Health
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Final Onboarding Review
            </h1>

            <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              Review each onboarding requirement below. Any incomplete step must
              be finished before onboarding is considered complete.
            </p>

            <div className="mx-auto mt-6 h-1.5 w-20 rounded-full bg-teal-700" />

            <p className="mx-auto mt-6 max-w-3xl text-sm leading-7 text-slate-500">
              This final screen confirms whether your application, documents,
              contracts, and training are fully complete and ready for packet generation.
            </p>
          </div>
        </section>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_2fr]">
          <aside className="space-y-6">
            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Completion Progress
              </div>

              <div className="mt-3 text-3xl font-extrabold text-slate-900">
                {[status.step2, status.step3, status.step4, status.step5].filter(Boolean).length}/4
              </div>

              <p className="mt-2 text-sm text-slate-600">
                Required onboarding stages completed
              </p>

              <div className="mt-5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-3 rounded-full bg-teal-700 transition-all duration-300"
                  style={{
                    width: `${Math.round(
                      ([status.step2, status.step3, status.step4, status.step5].filter(Boolean).length / 4) * 100
                    )}%`,
                  }}
                />
              </div>

              <div className="mt-2 text-sm font-semibold text-teal-700">
                {Math.round(
                  ([status.step2, status.step3, status.step4, status.step5].filter(Boolean).length / 4) * 100
                )}
                % complete
              </div>

              <div
                className={`mt-6 inline-flex rounded-full px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] ${
                  overallComplete
                    ? "bg-teal-50 text-teal-700"
                    : "bg-amber-100 text-amber-700"
                }`}
              >
                {overallComplete ? "Ready for Final Packet" : "Completion Needed"}
              </div>

              {isCreatingComplianceEvents ? (
                <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50 p-4">
                  <p className="text-sm font-semibold text-teal-800">
                    Creating annual compliance items...
                  </p>
                </div>
              ) : null}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                Completion Summary
              </p>
              <h3 className="mt-1 text-xl font-bold text-slate-900">
                Final checklist status
              </h3>

              <div className="mt-5 space-y-3">
                <MiniStatusRow label="Application complete" complete={status.step2} />
                <MiniStatusRow label="Documents uploaded" complete={status.step3} />
                <MiniStatusRow label="Contracts completed" complete={status.step4} />
                <MiniStatusRow label="Training completed" complete={status.step5} />
              </div>
            </div>
          </aside>

          <section className="space-y-6">
            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-teal-700">
                Onboarding Review
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                Step-by-step completion status
              </h2>

              <div className="mt-6 space-y-4">
              <StatusRow
                label="Application (Step 2)"
                complete={status.step2}
                link="/onboarding-application"
              />

              <StatusRow
                label="Documents Upload (Step 3)"
                complete={status.step3}
                link="/onboarding-documents"
              />

              <StatusRow
                label="Contracts & Agreements (Step 4)"
                complete={status.step4}
                link="/onboarding-contracts"
              />

              <StatusRow
                label="Training (Step 5)"
                complete={status.step5}
                link="/onboarding-training"
              />
              </div>
            </div>

            <div>
              {overallComplete ? (
                <div className="rounded-[24px] border border-teal-200 bg-teal-50 p-8 text-center shadow-sm">
                  <div className="mx-auto inline-flex rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-teal-700 shadow-sm">
                    Final Status
                  </div>
                  <h2 className="mt-5 text-3xl font-bold text-teal-800">
                    Onboarding Complete
                  </h2>
                  <p className="mt-3 text-base leading-7 text-teal-700">
                    All required steps have been completed successfully.
                  </p>

                  <button
                    type="button"
                    onClick={handleDownloadPdf}
                    disabled={isDownloadingPdf}
                    className="mt-6 inline-flex items-center justify-center rounded-full bg-teal-700 px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_16px_36px_rgba(15,118,110,0.28)] transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-70"
                  >
                    {isDownloadingPdf
                      ? "Generating PDF..."
                      : "Download Onboarding PDF"}
                  </button>
                </div>
              ) : (
                <div className="rounded-[24px] border border-amber-200 bg-amber-50 p-8 text-center shadow-sm">
                  <div className="mx-auto inline-flex rounded-full bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.14em] text-amber-700 shadow-sm">
                    Action Needed
                  </div>
                  <h2 className="mt-5 text-3xl font-bold text-amber-800">
                    Action Required
                  </h2>
                  <p className="mt-3 text-base leading-7 text-amber-700">
                    Please complete all steps above before finishing onboarding.
                  </p>
                </div>
              )}
            </div>

            <div className="rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                Debug Status
              </p>
              <p className="mt-2 break-words text-sm text-slate-600">
                {debugMessage}
              </p>
            </div>
          </section>
        </div>
      </section>
    </main>
  );
}

function StatusRow({
  label,
  complete,
  link,
}: {
  label: string;
  complete: boolean;
  link: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-5 py-5">
      <span className="text-base font-semibold text-slate-800">{label}</span>

      {complete ? (
        <span className="inline-flex items-center rounded-full bg-teal-50 px-4 py-2 text-sm font-semibold text-teal-700">
          Complete
        </span>
      ) : (
        <Link
          href={link}
          className="inline-flex items-center rounded-full bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
        >
          Finish
        </Link>
      )}
    </div>
  );
}

function MiniStatusRow({
  label,
  complete,
}: {
  label: string;
  complete: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="text-sm font-medium text-slate-700">{label}</span>
      <span
        className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
          complete
            ? "bg-teal-50 text-teal-700"
            : "bg-amber-100 text-amber-700"
        }`}
      >
        {complete ? "Complete" : "Pending"}
      </span>
    </div>
  );
}
