"use client";

import { type FormEvent, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import OnboardingApplicantFromQuery from "../../components/OnboardingApplicantFromQuery";
import OnboardingProgressSync from "../../components/OnboardingProgressSync";
import OnboardingApplicantIdentity from "../../components/OnboardingApplicantIdentity";
import { supabase } from "@/lib/supabase/client";

const REQUIRED_MODULE_KEYS = [
  "bloodborne-pathogens",
  "infection-control",
  "patient-rights",
  "hipaa",
  "emergency-preparedness",
  "fraud-waste-abuse",
] as const;

type TrainingModuleKey = (typeof REQUIRED_MODULE_KEYS)[number];

type TrainingModuleRow = {
  id: string;
  key: string;
  number: number | null;
  sort_order: number | null;
  title: string;
  description: string | null;
  category: string | null;
  pdf_url: string | null;
  pass_score: number | null;
};

type TrainingAttemptRow = {
  id: string;
  applicant_id: string;
  module_id: string;
  score: number;
  passed: boolean;
  completed_at: string;
  created_at: string | null;
};

type TrainingCompletionRow = {
  id: string;
  applicant_id: string;
  module_id: string;
  score: number;
  passed: boolean;
  completed_at: string;
};

type ApplicantRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type QuizQuestion = {
  id: string;
  question: string;
  options: string[];
  correctAnswer: string;
};

type QuizBank = Record<TrainingModuleKey, QuizQuestion[]>;

const DEFAULT_PASS_SCORE = 80;

const QUIZ_BANK: QuizBank = {
  "bloodborne-pathogens": [
    {
      id: "q1",
      question:
        "Which body fluids are treated as potentially infectious under bloodborne pathogen precautions?",
      options: [
        "Only visible blood",
        "Blood and certain body fluids that may carry bloodborne pathogens",
        "Sweat only",
        "Tears only",
      ],
      correctAnswer:
        "Blood and certain body fluids that may carry bloodborne pathogens",
    },
    {
      id: "q2",
      question: "What should you do first after a needlestick or sharps injury?",
      options: [
        "Wait until the end of the shift to report it",
        "Wash the area and report the exposure immediately",
        "Cover it and keep working without telling anyone",
        "Throw the sharp in regular trash",
      ],
      correctAnswer: "Wash the area and report the exposure immediately",
    },
    {
      id: "q3",
      question: "Used needles should be disposed of in:",
      options: [
        "A regular trash bag",
        "A sharps container",
        "A linen hamper",
        "A cabinet until pickup",
      ],
      correctAnswer: "A sharps container",
    },
    {
      id: "q4",
      question: "When are gloves required?",
      options: [
        "Only for hospital patients",
        "Any time contact with blood or potentially infectious material is possible",
        "Only when a supervisor is watching",
        "Only when cleaning floors",
      ],
      correctAnswer:
        "Any time contact with blood or potentially infectious material is possible",
    },
    {
      id: "q5",
      question: "What do standard precautions mean?",
      options: [
        "Treat all blood and certain body fluids as potentially infectious",
        "Use PPE only if the patient asks for it",
        "Wash hands only once per shift",
        "Only use precautions for known infections",
      ],
      correctAnswer:
        "Treat all blood and certain body fluids as potentially infectious",
    },
    {
      id: "q6",
      question: "If blood splashes into your eyes, you should:",
      options: [
        "Ignore it if your vision seems normal",
        "Rinse the eyes immediately and report the exposure",
        "Wait for your next break",
        "Cover your eyes with gauze only",
      ],
      correctAnswer: "Rinse the eyes immediately and report the exposure",
    },
    {
      id: "q7",
      question: "Hand hygiene should be performed:",
      options: [
        "Before and after patient contact and after glove removal",
        "Only before lunch",
        "Only at the start of the shift",
        "Only when hands look dirty",
      ],
      correctAnswer:
        "Before and after patient contact and after glove removal",
    },
    {
      id: "q8",
      question: "What is the safest way to handle contaminated sharps?",
      options: [
        "Recap needles with two hands",
        "Bend needles before disposal",
        "Dispose of them immediately without recapping whenever possible",
        "Place them on the bedside table temporarily",
      ],
      correctAnswer:
        "Dispose of them immediately without recapping whenever possible",
    },
  ],
  "infection-control": [
    {
      id: "q1",
      question:
        "What is the most effective basic step to prevent the spread of infection?",
      options: [
        "Hand hygiene",
        "Double charting",
        "Leaving gloves on longer",
        "Avoiding patient contact",
      ],
      correctAnswer: "Hand hygiene",
    },
    {
      id: "q2",
      question: "Standard precautions should be used:",
      options: [
        "Only with patients who have confirmed infections",
        "With every patient encounter as appropriate",
        "Only in hospitals",
        "Only during wound care",
      ],
      correctAnswer: "With every patient encounter as appropriate",
    },
    {
      id: "q3",
      question: "Gloves should be changed:",
      options: [
        "Only when visibly torn",
        "Between tasks and between patients",
        "At the end of the shift only",
        "Only after medication passes",
      ],
      correctAnswer: "Between tasks and between patients",
    },
    {
      id: "q4",
      question: "Reusable equipment should be:",
      options: [
        "Shared without cleaning if used carefully",
        "Cleaned and disinfected per policy before reuse",
        "Stored while still wet",
        "Used only once",
      ],
      correctAnswer: "Cleaned and disinfected per policy before reuse",
    },
    {
      id: "q5",
      question: "When should hand hygiene be performed?",
      options: [
        "Before and after patient contact",
        "Only after removing gloves",
        "Only when hands look dirty",
        "At lunch and at the end of the day",
      ],
      correctAnswer: "Before and after patient contact",
    },
    {
      id: "q6",
      question: "If PPE becomes contaminated during care, you should:",
      options: [
        "Keep using it until the visit is finished",
        "Replace it as soon as it is safe to do so",
        "Set it on a clean counter for reuse",
        "Ignore it if the contamination is small",
      ],
      correctAnswer: "Replace it as soon as it is safe to do so",
    },
    {
      id: "q7",
      question: "Why is cleaning high-touch surfaces important?",
      options: [
        "It improves room appearance only",
        "It reduces transmission of germs",
        "It replaces hand hygiene",
        "It is optional in home care",
      ],
      correctAnswer: "It reduces transmission of germs",
    },
    {
      id: "q8",
      question: "What should you do if you notice signs of infection risk in the home?",
      options: [
        "Ignore it unless the patient complains",
        "Follow protocol, educate when appropriate, and report concerns",
        "Document it next month",
        "Wait for another staff member to handle it",
      ],
      correctAnswer:
        "Follow protocol, educate when appropriate, and report concerns",
    },
  ],
  "patient-rights": [
    {
      id: "q1",
      question: "Patients have the right to be treated with:",
      options: [
        "Speed only",
        "Dignity and respect",
        "Minimal communication",
        "Strict routine without input",
      ],
      correctAnswer: "Dignity and respect",
    },
    {
      id: "q2",
      question: "A patient has the right to participate in care decisions:",
      options: [
        "Only if a family member allows it",
        "Yes, to the extent they are able and informed",
        "Only after discharge",
        "Only in writing",
      ],
      correctAnswer: "Yes, to the extent they are able and informed",
    },
    {
      id: "q3",
      question: "Protected health information should be shared:",
      options: [
        "With anyone involved in the home",
        "Only as permitted and necessary for care or operations",
        "Freely if the patient is asleep",
        "On social media if names are removed",
      ],
      correctAnswer:
        "Only as permitted and necessary for care or operations",
    },
    {
      id: "q4",
      question: "If a patient voices a concern or complaint, staff should:",
      options: [
        "Dismiss it if care is still being provided",
        "Listen respectfully and follow reporting procedures",
        "Tell them complaints are not allowed",
        "Wait until the next visit to document it",
      ],
      correctAnswer:
        "Listen respectfully and follow reporting procedures",
    },
    {
      id: "q5",
      question: "Patients have the right to receive information in a way they can understand:",
      options: [
        "Yes",
        "No, standard forms are enough",
        "Only if they request a lawyer",
        "Only in English",
      ],
      correctAnswer: "Yes",
    },
    {
      id: "q6",
      question: "Respecting patient rights includes:",
      options: [
        "Entering private areas without explanation",
        "Supporting privacy, choices, and informed participation",
        "Making decisions for the patient without discussion",
        "Sharing updates with neighbors",
      ],
      correctAnswer:
        "Supporting privacy, choices, and informed participation",
    },
    {
      id: "q7",
      question: "If a patient refuses a service, staff should:",
      options: [
        "Force completion for compliance",
        "Respect the refusal, educate as appropriate, and document it",
        "Argue until they agree",
        "Ignore the refusal and proceed",
      ],
      correctAnswer:
        "Respect the refusal, educate as appropriate, and document it",
    },
    {
      id: "q8",
      question: "Patient rights apply:",
      options: [
        "Only during admission",
        "Throughout the entire care relationship",
        "Only when family is present",
        "Only in the office",
      ],
      correctAnswer: "Throughout the entire care relationship",
    },
  ],
  hipaa: [
    {
      id: "q1",
      question: "HIPAA primarily protects:",
      options: [
        "Office supplies",
        "Patient health information",
        "Only billing codes",
        "Only electronic records",
      ],
      correctAnswer: "Patient health information",
    },
    {
      id: "q2",
      question: "The minimum necessary standard means:",
      options: [
        "Share everything to avoid mistakes",
        "Access or disclose only what is needed for the task",
        "Only managers can view PHI",
        "PHI can never be discussed",
      ],
      correctAnswer:
        "Access or disclose only what is needed for the task",
    },
    {
      id: "q3",
      question: "You should discuss patient information:",
      options: [
        "In public hallways whenever needed",
        "Only in appropriate settings with authorized people",
        "With friends if you omit the last name",
        "On personal devices without safeguards",
      ],
      correctAnswer:
        "Only in appropriate settings with authorized people",
    },
    {
      id: "q4",
      question: "If you accidentally disclose PHI, you should:",
      options: [
        "Ignore it if it was a small disclosure",
        "Report it promptly according to policy",
        "Delete your charting",
        "Ask the patient not to mention it",
      ],
      correctAnswer: "Report it promptly according to policy",
    },
    {
      id: "q5",
      question: "Paper records containing PHI should be:",
      options: [
        "Left in a visible area for convenience",
        "Secured when not in use",
        "Taken home for easier access",
        "Discarded in open trash bins",
      ],
      correctAnswer: "Secured when not in use",
    },
    {
      id: "q6",
      question: "Passwords for systems containing PHI should be:",
      options: [
        "Shared with coworkers",
        "Kept private and protected",
        "Written on the workstation",
        "Reused from personal accounts without concern",
      ],
      correctAnswer: "Kept private and protected",
    },
    {
      id: "q7",
      question: "Which is an example of improper PHI access?",
      options: [
        "Viewing a record needed for your assigned patient",
        "Looking up a patient record out of curiosity",
        "Sharing information with an authorized clinician",
        "Documenting care in the chart",
      ],
      correctAnswer: "Looking up a patient record out of curiosity",
    },
    {
      id: "q8",
      question: "HIPAA applies in home health:",
      options: [
        "Only in the office",
        "In the field and in the office",
        "Only for nurses",
        "Only when patients ask for privacy",
      ],
      correctAnswer: "In the field and in the office",
    },
  ],
  "emergency-preparedness": [
    {
      id: "q1",
      question: "Emergency preparedness in home health begins with:",
      options: [
        "Waiting for a disaster to occur",
        "Knowing the patient plan and agency procedures",
        "Calling 911 for every issue",
        "Skipping documentation",
      ],
      correctAnswer: "Knowing the patient plan and agency procedures",
    },
    {
      id: "q2",
      question: "If normal communication is disrupted during an emergency, staff should:",
      options: [
        "Stop all updates",
        "Use approved backup communication procedures",
        "Text any number they can find",
        "Wait until the next day",
      ],
      correctAnswer: "Use approved backup communication procedures",
    },
    {
      id: "q3",
      question: "Patients who depend on electricity for equipment may require:",
      options: [
        "No special planning",
        "Priority emergency planning and escalation awareness",
        "Less frequent visits",
        "Only paper charting",
      ],
      correctAnswer:
        "Priority emergency planning and escalation awareness",
    },
    {
      id: "q4",
      question: "If a patient is in immediate danger, the first priority is to:",
      options: [
        "Finish the visit note",
        "Protect life and follow emergency response procedures",
        "Call payroll",
        "Wait for office approval",
      ],
      correctAnswer:
        "Protect life and follow emergency response procedures",
    },
    {
      id: "q5",
      question: "Emergency events and service disruptions should be:",
      options: [
        "Documented and reported per policy",
        "Handled informally only",
        "Shared on social media for awareness",
        "Ignored if services resume quickly",
      ],
      correctAnswer: "Documented and reported per policy",
    },
    {
      id: "q6",
      question: "Staff should know how to access:",
      options: [
        "Only their own work schedule",
        "Agency emergency contacts and escalation pathways",
        "Patient financial records only",
        "Only paper maps",
      ],
      correctAnswer:
        "Agency emergency contacts and escalation pathways",
    },
    {
      id: "q7",
      question: "Preparedness planning helps staff:",
      options: [
        "React randomly under pressure",
        "Respond consistently and safely during disruptions",
        "Avoid patient communication",
        "Replace clinical judgment",
      ],
      correctAnswer:
        "Respond consistently and safely during disruptions",
    },
    {
      id: "q8",
      question: "If evacuation instructions are part of the care plan, staff should:",
      options: [
        "Ignore them unless a storm is confirmed",
        "Understand and reinforce them appropriately",
        "Create new instructions without approval",
        "Leave planning entirely to neighbors",
      ],
      correctAnswer: "Understand and reinforce them appropriately",
    },
  ],
  "fraud-waste-abuse": [
    {
      id: "q1",
      question: "Fraud involves:",
      options: [
        "An honest mistake with no intent",
        "Intentional deception for unauthorized benefit",
        "Routine charting delays",
        "Any denied claim",
      ],
      correctAnswer: "Intentional deception for unauthorized benefit",
    },
    {
      id: "q2",
      question: "Waste generally refers to:",
      options: [
        "Necessary care that is well documented",
        "Overuse or misuse of resources without medical or operational value",
        "Only theft of medications",
        "Patient complaints",
      ],
      correctAnswer:
        "Overuse or misuse of resources without medical or operational value",
    },
    {
      id: "q3",
      question: "Abuse can include:",
      options: [
        "Practices that are inconsistent with sound business or medical standards",
        "Only intentional criminal acts",
        "Only HIPAA violations",
        "Only payroll errors",
      ],
      correctAnswer:
        "Practices that are inconsistent with sound business or medical standards",
    },
    {
      id: "q4",
      question: "If you suspect fraud, waste, or abuse, you should:",
      options: [
        "Ignore it unless you have proof beyond doubt",
        "Report it through the appropriate internal process",
        "Post about it publicly",
        "Confront the person aggressively",
      ],
      correctAnswer:
        "Report it through the appropriate internal process",
    },
    {
      id: "q5",
      question: "Accurate documentation and billing are important because they:",
      options: [
        "Support compliant care and reimbursement",
        "Are optional if the patient was seen",
        "Only matter for annual audits",
        "Reduce the need for supervision",
      ],
      correctAnswer: "Support compliant care and reimbursement",
    },
    {
      id: "q6",
      question: "Examples of red flags may include:",
      options: [
        "Services billed but not provided",
        "Timely and accurate documentation",
        "Using approved policies",
        "Reporting concerns promptly",
      ],
      correctAnswer: "Services billed but not provided",
    },
    {
      id: "q7",
      question: "Employees are expected to:",
      options: [
        "Protect the organization by staying silent",
        "Act ethically and report suspected noncompliance",
        "Handle investigations on their own",
        "Edit records after submission without approval",
      ],
      correctAnswer:
        "Act ethically and report suspected noncompliance",
    },
    {
      id: "q8",
      question: "A compliance-focused culture depends on:",
      options: [
        "Shortcuts when the team is busy",
        "Honesty, accurate records, and timely reporting",
        "Avoiding all questions",
        "Only leadership involvement",
      ],
      correctAnswer:
        "Honesty, accurate records, and timely reporting",
    },
  ],
};

function createInitialAnswersByModule() {
  return REQUIRED_MODULE_KEYS.reduce<
    Partial<Record<TrainingModuleKey, Record<string, string>>>
  >((moduleAnswers, moduleKey) => {
    moduleAnswers[moduleKey] = QUIZ_BANK[moduleKey].reduce<
      Record<string, string>
    >((questionAnswers, question) => {
      questionAnswers[question.id] = "";
      return questionAnswers;
    }, {});

    return moduleAnswers;
  }, {});
}

function isTrainingModuleKey(value: string): value is TrainingModuleKey {
  return REQUIRED_MODULE_KEYS.includes(value as TrainingModuleKey);
}

function formatCertificateDate(value: string) {
  return new Date(value).toLocaleDateString();
}

async function generateTrainingCertificatePdf({
  applicantId,
  employeeName,
  modules,
  completionsByModuleId,
}: {
  applicantId: string;
  employeeName: string;
  modules: TrainingModuleRow[];
  completionsByModuleId: Record<string, TrainingCompletionRow>;
}) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([612, 792]);
  const { width, height } = page.getSize();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const margin = 48;
  const generatedAt = new Date().toISOString();
  let y = height - margin;

  const addPage = () => {
    page = pdfDoc.addPage([612, 792]);
    y = height - margin;
  };

  const ensureSpace = (needed = 24) => {
    if (y < margin + needed) addPage();
  };

  const drawWrappedText = (
    text: string,
    options?: {
      bold?: boolean;
      size?: number;
      indent?: number;
      color?: ReturnType<typeof rgb>;
    }
  ) => {
    const activeFont = options?.bold ? boldFont : font;
    const size = options?.size ?? 10;
    const indent = options?.indent ?? 0;
    const color = options?.color ?? rgb(0.15, 0.15, 0.2);
    const maxWidth = width - margin * 2 - indent;
    const words = text.split(/\s+/).filter(Boolean);
    let line = "";

    words.forEach((word) => {
      const nextLine = line ? `${line} ${word}` : word;
      const nextWidth = activeFont.widthOfTextAtSize(nextLine, size);

      if (nextWidth > maxWidth && line) {
        ensureSpace(size + 10);
        page.drawText(line, {
          x: margin + indent,
          y,
          size,
          font: activeFont,
          color,
        });
        y -= size + 6;
        line = word;
        return;
      }

      line = nextLine;
    });

    if (line) {
      ensureSpace(size + 10);
      page.drawText(line, {
        x: margin + indent,
        y,
        size,
        font: activeFont,
        color,
      });
      y -= size + 6;
    }
  };

  const drawDivider = () => {
    ensureSpace(18);
    page.drawLine({
      start: { x: margin, y },
      end: { x: width - margin, y },
      thickness: 1,
      color: rgb(0.84, 0.88, 0.93),
    });
    y -= 16;
  };

  const drawSectionTitle = (title: string) => {
    y -= 4;
    drawWrappedText(title, { bold: true, size: 13, color: rgb(0.02, 0.39, 0.73) });
    y -= 2;
  };

  const drawField = (label: string, value: string) => {
    drawWrappedText(`${label}: ${value}`);
  };

  drawWrappedText("Saintly Home Health", {
    bold: true,
    size: 20,
    color: rgb(0.02, 0.39, 0.73),
  });
  drawWrappedText("Orientation Training Certificate", {
    bold: true,
    size: 14,
  });
  y -= 8;

  drawSectionTitle("Employee Information");
  drawField("Employee Name", employeeName);
  drawField("Applicant ID", applicantId);
  drawField("Generated Date", formatCertificateDate(generatedAt));

  drawDivider();
  drawSectionTitle("Completion Summary");
  drawWrappedText(
    "This certifies that the employee completed Saintly Home Health required onboarding training."
  );

  drawDivider();
  drawSectionTitle("Module Results");

  modules.forEach((module, index) => {
    const completion = completionsByModuleId[module.id];
    if (!completion) return;

    drawWrappedText(`${index + 1}. ${module.title}`, { bold: true, size: 11 });
    drawWrappedText(`Score: ${completion.score}%`, { indent: 12 });
    drawWrappedText(`Status: ${completion.passed ? "Passed" : "Failed"}`, {
      indent: 12,
    });
    drawWrappedText(
      `Completed At: ${formatCertificateDate(completion.completed_at)}`,
      { indent: 12 }
    );
    y -= 4;
  });

  drawDivider();
  drawSectionTitle("Final Statement");
  drawWrappedText(
    "The employee successfully completed all required onboarding training modules."
  );

  drawDivider();
  drawSectionTitle("Signature");
  drawField("Employee Name", employeeName);
  drawField("Date Generated", formatCertificateDate(generatedAt));
  y -= 10;
  drawWrappedText("Employee Signature: ________________________________");
  y -= 8;
  drawWrappedText("Saintly Reviewer: _________________________________");

  return pdfDoc.save();
}

export default function OnboardingTrainingPage() {
  const [applicantId, setApplicantId] = useState<string | null>(null);
  const [applicantName, setApplicantName] = useState("");
  const [modules, setModules] = useState<TrainingModuleRow[]>([]);
  const [answersByModule, setAnswersByModule] = useState(
    createInitialAnswersByModule
  );
  const [hasOpenedPdfByModuleId, setHasOpenedPdfByModuleId] = useState<
    Record<string, boolean>
  >({});
  const [activePdfModule, setActivePdfModule] = useState<TrainingModuleRow | null>(
    null
  );
  const [attemptsByModuleId, setAttemptsByModuleId] = useState<
    Record<string, TrainingAttemptRow>
  >({});
  const [completionsByModuleId, setCompletionsByModuleId] = useState<
    Record<string, TrainingCompletionRow>
  >({});
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);
  const [submittingModuleKey, setSubmittingModuleKey] = useState<string | null>(
    null
  );
  const [isDownloadingCertificate, setIsDownloadingCertificate] = useState(false);

  useEffect(() => {
    const storedApplicantId = window.localStorage.getItem("applicantId");

    if (!storedApplicantId) {
      setPageError(
        "We could not find your onboarding session. Please return to the application step and try again."
      );
      setLoading(false);
      return;
    }

    setApplicantId(storedApplicantId);
  }, []);

  const totalCount = REQUIRED_MODULE_KEYS.length;

  const completedCount = useMemo(() => {
    return modules.filter((module) => completionsByModuleId[module.id]?.passed)
      .length;
  }, [completionsByModuleId, modules]);

  const percentComplete =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const allRequiredComplete =
    modules.length === totalCount && completedCount === totalCount;

  const syncTrainingSummary = useCallback(
    async (applicantIdValue: string, completedModules: number) => {
      const isComplete = completedModules === totalCount;

      if (isComplete) {
        const { error } = await supabase
          .from("applicant_training_progress")
          .upsert(
            {
              applicant_id: applicantIdValue,
              completed_modules: completedModules,
              total_modules: totalCount,
              is_complete: true,
              completed_at: new Date().toISOString(),
            },
            {
              onConflict: "applicant_id",
            }
          );

        if (error) throw error;

        window.localStorage.setItem("onboardingStep5Complete", "true");
        return;
      }

      const { error } = await supabase
        .from("applicant_training_progress")
        .delete()
        .eq("applicant_id", applicantIdValue);

      if (error) throw error;

      window.localStorage.removeItem("onboardingStep5Complete");
    },
    [totalCount]
  );

  useEffect(() => {
    if (!applicantId) return;

    const loadTrainingState = async () => {
      setLoading(true);
      setPageError(null);

      const [
        { data: moduleData, error: moduleError },
        { data: applicantData, error: applicantError },
      ] = await Promise.all([
        supabase
          .from("training_modules")
          .select(
            "id, key, number, sort_order, title, description, category, pdf_url, pass_score"
          )
          .in("key", [...REQUIRED_MODULE_KEYS])
          .order("sort_order", { ascending: true }),
        supabase
          .from("applicants")
          .select("id, first_name, last_name")
          .eq("id", applicantId)
          .maybeSingle(),
      ]);

      if (moduleError) {
        setPageError(moduleError.message || "Failed to load training modules.");
        setLoading(false);
        return;
      }

      if (applicantError) {
        console.error("Failed to load applicant name:", applicantError);
      }

      const typedApplicant = (applicantData as ApplicantRow | null) ?? null;
      const fullName = [typedApplicant?.first_name, typedApplicant?.last_name]
        .filter(Boolean)
        .join(" ")
        .trim();

      setApplicantName(fullName);

      const loadedModules = ((moduleData || []) as TrainingModuleRow[]).filter(
        (module) => isTrainingModuleKey(module.key)
      );
      const moduleIds = loadedModules.map((module) => module.id);

      let latestAttemptsByModule: Record<string, TrainingAttemptRow> = {};
      let completionsByModule: Record<string, TrainingCompletionRow> = {};

      if (moduleIds.length > 0) {
        const [
          { data: completionData, error: completionError },
          { data: attemptData, error: attemptError },
        ] = await Promise.all([
          supabase
            .from("employee_training_completions")
            .select("id, applicant_id, module_id, score, passed, completed_at")
            .eq("applicant_id", applicantId)
            .in("module_id", moduleIds),
          supabase
            .from("employee_training_attempts")
            .select(
              "id, applicant_id, module_id, score, passed, completed_at, created_at"
            )
            .eq("applicant_id", applicantId)
            .in("module_id", moduleIds)
            .order("created_at", { ascending: false }),
        ]);

        if (completionError) {
          setPageError(
            completionError.message || "Failed to load training completion."
          );
          setLoading(false);
          return;
        }

        if (attemptError) {
          setPageError(
            attemptError.message || "Failed to load training attempts."
          );
          setLoading(false);
          return;
        }

        completionsByModule = ((completionData || []) as TrainingCompletionRow[]).reduce<
          Record<string, TrainingCompletionRow>
        >((accumulator, row) => {
          accumulator[row.module_id] = row;
          return accumulator;
        }, {});

        latestAttemptsByModule = ((attemptData || []) as TrainingAttemptRow[]).reduce<
          Record<string, TrainingAttemptRow>
        >((accumulator, row) => {
          if (!accumulator[row.module_id]) {
            accumulator[row.module_id] = row;
          }

          return accumulator;
        }, {});
      }

      setModules(loadedModules);
      setCompletionsByModuleId(completionsByModule);
      setAttemptsByModuleId(latestAttemptsByModule);

      try {
        await syncTrainingSummary(applicantId, Object.keys(completionsByModule).length);
      } catch (summaryError) {
        console.error(summaryError);
      }

      if (loadedModules.length !== totalCount) {
        setPageError(
          `Expected ${totalCount} required modules, but found ${loadedModules.length}. Continue will stay locked until all required modules are configured.`
        );
      }

      setLoading(false);
    };

    loadTrainingState();
  }, [applicantId, syncTrainingSummary, totalCount]);

  const handleAnswerChange = (
    moduleKey: TrainingModuleKey,
    questionId: string,
    option: string
  ) => {
    setAnswersByModule((currentAnswers) => ({
      ...currentAnswers,
      [moduleKey]: {
        ...currentAnswers[moduleKey],
        [questionId]: option,
      },
    }));
  };

  const handleSubmitQuiz =
    (module: TrainingModuleRow, questions: QuizQuestion[]) =>
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!applicantId || submittingModuleKey) return;
      if (!isTrainingModuleKey(module.key)) return;

      const completion = completionsByModuleId[module.id];
      const answers = answersByModule[module.key] || {};
      const allAnswered =
        questions.length > 0 && questions.every((question) => answers[question.id]);

      if (completion?.passed || !allAnswered) {
        return;
      }

      setSubmittingModuleKey(module.key);
      setPageError(null);

      const passScore = module.pass_score ?? DEFAULT_PASS_SCORE;
      const correctAnswers = questions.filter(
        (question) => answers[question.id] === question.correctAnswer
      ).length;
      const score = Math.round((correctAnswers / questions.length) * 100);
      const passed = score >= passScore;
      const completedAt = new Date().toISOString();

      try {
        const { data: savedAttempt, error: attemptError } = await supabase
          .from("employee_training_attempts")
          .insert({
            applicant_id: applicantId,
            module_id: module.id,
            score,
            passed,
            completed_at: completedAt,
          })
          .select(
            "id, applicant_id, module_id, score, passed, completed_at, created_at"
          )
          .single();

        if (attemptError) throw attemptError;

        const nextAttemptsByModuleId = {
          ...attemptsByModuleId,
          [module.id]: savedAttempt as TrainingAttemptRow,
        };

        setAttemptsByModuleId(nextAttemptsByModuleId);

        if (passed) {
          const { data: savedCompletion, error: completionError } =
            await supabase
              .from("employee_training_completions")
              .upsert(
                {
                  applicant_id: applicantId,
                  module_id: module.id,
                  score,
                  passed: true,
                  completed_at: completedAt,
                },
                {
                  onConflict: "applicant_id,module_id",
                }
              )
              .select("id, applicant_id, module_id, score, passed, completed_at")
              .single();

          if (completionError) throw completionError;

          const nextCompletionsByModuleId = {
            ...completionsByModuleId,
            [module.id]: savedCompletion as TrainingCompletionRow,
          };

          setCompletionsByModuleId(nextCompletionsByModuleId);
          await syncTrainingSummary(
            applicantId,
            Object.keys(nextCompletionsByModuleId).length
          );
        } else {
          await syncTrainingSummary(applicantId, Object.keys(completionsByModuleId).length);
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Failed to submit training quiz.";

        setPageError(message);
      } finally {
        setSubmittingModuleKey(null);
      }
    };

  const handleRetakeQuiz = (moduleKey: TrainingModuleKey) => {
    setAnswersByModule((currentAnswers) => ({
      ...currentAnswers,
      [moduleKey]: QUIZ_BANK[moduleKey].reduce<Record<string, string>>(
        (questionAnswers, question) => {
          questionAnswers[question.id] = "";
          return questionAnswers;
        },
        {}
      ),
    }));

    setPageError(null);
  };

  const handleContinueMouseDown = () => {
    if (!allRequiredComplete) return;
    window.localStorage.setItem("onboardingStep5Complete", "true");
  };

  const handleOpenPdf = (module: TrainingModuleRow) => {
    setHasOpenedPdfByModuleId((currentState) => ({
      ...currentState,
      [module.id]: true,
    }));
    setActivePdfModule(module);
  };

  const handleDownloadCertificate = async () => {
    if (!applicantId || !allRequiredComplete || isDownloadingCertificate) {
      return;
    }

    setIsDownloadingCertificate(true);
    setPageError(null);

    try {
      const pdfBytes = await generateTrainingCertificatePdf({
        applicantId,
        employeeName: applicantName || applicantId,
        modules,
        completionsByModuleId,
      });

      const blob = new Blob([pdfBytes as BlobPart], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      const safeName = (applicantName || applicantId).replace(/\s+/g, "-");

      link.href = url;
      link.download = `training-certificate-${safeName}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setPageError("Failed to generate training certificate.");
    } finally {
      setIsDownloadingCertificate(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <Suspense fallback={null}>
        <OnboardingApplicantFromQuery />
      </Suspense>
      <OnboardingProgressSync />
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-center justify-center gap-3">
          <div className="rounded-full border border-teal-200 bg-white px-4 py-2 text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500 shadow-sm">
            Employee Onboarding · Step 5 of 6
          </div>
        </div>

        <OnboardingApplicantIdentity />

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {[
            { label: "1. Welcome", href: "/onboarding-welcome", state: "complete" },
            { label: "2. Application", href: "/onboarding-application", state: "complete" },
            { label: "3. Documents", href: "/onboarding-documents", state: "complete" },
            { label: "4. Contracts", href: "/onboarding-contracts", state: "complete" },
            { label: "5. Training", href: "/onboarding-training", state: "current" },
            { label: "6. Complete", href: "/onboarding-complete", state: "upcoming" },
          ].map((step) => {
            const isComplete = step.state === "complete";
            const isCurrent = step.state === "current";

            return (
              <a
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
              </a>
            );
          })}
        </div>

        <div className="overflow-hidden rounded-[28px] border border-cyan-200/70 bg-[radial-gradient(circle_at_top_left,_rgba(224,247,244,1)_0%,_rgba(255,255,255,1)_58%)] p-6 shadow-[0_24px_60px_rgba(14,116,144,0.12)] sm:p-8">
          <div className="mx-auto max-w-4xl text-center">
            <div className="mb-3 text-[11px] font-bold uppercase tracking-[0.28em] text-teal-700">
              Welcome to Saintly Home Health
            </div>

            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Orientation Training & Competency Program
            </h1>

            <p className="mx-auto mt-4 max-w-3xl text-sm leading-7 text-slate-600 sm:text-base">
              Complete all six required Saintly onboarding training modules below.
              Each quiz result is saved automatically, failed quizzes can be
              retaken, and passed modules lock automatically.
            </p>

            <div className="mx-auto mt-6 h-1.5 w-20 rounded-full bg-teal-700" />

            <p className="mx-auto mt-6 max-w-3xl text-sm leading-7 text-slate-500">
              This page tracks training attempts and completions directly in
              Supabase while keeping your onboarding progress in sync.
            </p>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_2fr]">
          <aside className="h-fit rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
              Training Progress
            </div>

            <div className="mt-3 text-3xl font-extrabold text-slate-900">
              {completedCount}/{totalCount}
            </div>

            <p className="mt-2 text-sm text-slate-600">
              Required modules passed
            </p>

            <div className="mt-5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-3 rounded-full bg-teal-700 transition-all duration-300"
                style={{ width: `${percentComplete}%` }}
              />
            </div>

            <div className="mt-2 text-sm font-semibold text-teal-700">
              {percentComplete}% complete
            </div>

            <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-bold text-amber-900">
                Before you continue
              </div>
              <p className="mt-2 text-sm leading-6 text-amber-800">
                All 6 required training modules must be passed with a score of at
                least 80% before the Continue button unlocks.
              </p>
            </div>

            {pageError && (
              <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {pageError}
              </div>
            )}

            {!loading && applicantId && (
              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">
                  Session
                </div>
                <div className="mt-2 break-all text-sm text-slate-600">
                  {applicantId}
                </div>
              </div>
            )}
          </aside>

          <section className="space-y-4">
            {loading ? (
              <div className="rounded-[24px] border border-slate-200 bg-white p-8 shadow-sm">
                <div className="text-sm text-slate-600">
                  Loading training modules...
                </div>
              </div>
            ) : modules.length === 0 ? (
              <div className="rounded-[24px] border border-red-200 bg-white p-8 shadow-sm">
                <div className="text-sm text-red-700">
                  No required training modules are available yet.
                </div>
              </div>
            ) : (
              modules.map((module, index) => {
                const moduleKey = module.key;
                if (!isTrainingModuleKey(moduleKey)) return null;

                const questions = QUIZ_BANK[moduleKey];
                const answers = answersByModule[moduleKey] || {};
                const passScore = module.pass_score ?? DEFAULT_PASS_SCORE;
                const completion = completionsByModuleId[module.id];
                const latestAttempt = attemptsByModuleId[module.id];
                const result = completion ?? latestAttempt;
                const answeredCount = questions.filter(
                  (question) => answers[question.id]
                ).length;
                const allAnswered =
                  questions.length > 0 &&
                  questions.every((question) => answers[question.id]);
                const isCompleted = !!completion?.passed;
                const isSubmitting = submittingModuleKey === moduleKey;
                const hasOpenedPdf = !!hasOpenedPdfByModuleId[module.id];
                const displayOrder =
                  module.sort_order ?? module.number ?? index + 1;

                return (
                  <article
                    key={module.id}
                    className={[
                      "rounded-[24px] border bg-white p-5 shadow-sm transition",
                      isCompleted
                        ? "border-teal-200 ring-1 ring-teal-100"
                        : "border-slate-200",
                    ].join(" ")}
                  >
                    <div className="flex flex-col gap-6">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-600">
                              Module {displayOrder}
                            </span>

                            <span className="rounded-full bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-cyan-800">
                              {module.category || "Training"}
                            </span>

                            <span className="rounded-full bg-amber-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
                              Pass Score {passScore}%
                            </span>

                            {isCompleted && (
                              <span className="rounded-full bg-teal-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-teal-700">
                                Completed
                              </span>
                            )}
                          </div>

                          <h2 className="mt-3 text-xl font-bold text-slate-900">
                            {module.title}
                          </h2>

                          <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-600">
                            {module.description}
                          </p>

                          {result?.completed_at && (
                            <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                              {isCompleted ? "Passed on" : "Last attempted on"}{" "}
                              {new Date(result.completed_at).toLocaleDateString()}
                            </p>
                          )}
                        </div>

                        <div className="w-full rounded-2xl border border-slate-200 bg-slate-50 p-4 lg:max-w-xs">
                          <div className="text-sm font-semibold text-slate-900">
                            Training Materials
                          </div>
                          <div className="mt-1 text-sm leading-6 text-slate-500">
                            Review the training PDF before completing the quiz.
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenPdf(module)}
                            className="mt-4 inline-flex w-full items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100"
                          >
                            Open Training PDF
                          </button>
                          {!hasOpenedPdf && (
                            <p className="mt-3 text-sm leading-6 text-amber-700">
                              Please review the training material before taking the
                              quiz.
                            </p>
                          )}
                        </div>
                      </div>

                      <form
                        onSubmit={handleSubmitQuiz(module, questions)}
                        className="space-y-4"
                      >
                        <div className="rounded-[20px] border border-slate-200 bg-slate-50 p-4">
                          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                            Quiz Progress
                          </div>
                          <div className="mt-2 text-sm text-slate-700">
                            {answeredCount} of {questions.length} questions
                            answered
                          </div>
                          {!hasOpenedPdf && (
                            <div className="mt-2 text-sm text-amber-700">
                              Please review the training material before taking the
                              quiz.
                            </div>
                          )}
                        </div>

                        {questions.map((question, questionIndex) => (
                          <div
                            key={`${moduleKey}-${question.id}`}
                            className="rounded-[20px] border border-slate-200 p-4"
                          >
                            <div className="text-sm font-semibold text-slate-900">
                              {questionIndex + 1}. {question.question}
                            </div>

                            <div className="mt-4 space-y-2">
                              {question.options.map((option) => (
                                <label
                                  key={`${moduleKey}-${question.id}-${option}`}
                                  className="flex cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:border-teal-200 hover:bg-teal-50/40"
                                >
                                  <input
                                    type="radio"
                                    name={`${moduleKey}-${question.id}`}
                                    value={option}
                                    checked={answers[question.id] === option}
                                    onChange={() =>
                                      handleAnswerChange(
                                        moduleKey,
                                        question.id,
                                        option
                                      )
                                    }
                                    disabled={
                                      !hasOpenedPdf ||
                                      isCompleted ||
                                      !!submittingModuleKey
                                    }
                                    className="mt-1 h-4 w-4 border-slate-300 text-teal-700 focus:ring-teal-700"
                                  />
                                  <span>{option}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        ))}

                        {result && (
                          <div
                            className={[
                              "rounded-[20px] border p-4",
                              result.passed
                                ? "border-teal-200 bg-teal-50"
                                : "border-amber-200 bg-amber-50",
                            ].join(" ")}
                          >
                            <div
                              className={[
                                "text-sm font-bold uppercase tracking-[0.14em]",
                                result.passed
                                  ? "text-teal-700"
                                  : "text-amber-800",
                              ].join(" ")}
                            >
                              {result.passed ? "Passed" : "Retake Required"}
                            </div>
                            <p className="mt-2 text-sm leading-6 text-slate-700">
                              Score: {result.score}%{" "}
                              {result.passed
                                ? "You passed and this module is now locked as completed."
                                : `A score of ${passScore}% is required to pass.`}
                            </p>
                          </div>
                        )}

                        <div className="flex flex-col gap-3 sm:flex-row">
                          <button
                            type="submit"
                            disabled={
                              !hasOpenedPdf ||
                              !allAnswered ||
                              !!submittingModuleKey ||
                              isCompleted ||
                              !applicantId
                            }
                            className={[
                              "inline-flex items-center justify-center rounded-full px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] transition",
                              !hasOpenedPdf ||
                              !allAnswered ||
                              !!submittingModuleKey ||
                              isCompleted ||
                              !applicantId
                                ? "cursor-not-allowed bg-slate-200 text-slate-500"
                                : "bg-teal-700 text-white shadow-[0_16px_36px_rgba(15,118,110,0.28)] hover:bg-teal-600",
                            ].join(" ")}
                          >
                            {isSubmitting
                              ? "Submitting Quiz..."
                              : isCompleted
                              ? "Module Locked"
                              : "Submit Quiz"}
                          </button>

                          {!isCompleted && (
                            <button
                              type="button"
                            onClick={() => handleRetakeQuiz(moduleKey)}
                              disabled={!hasOpenedPdf || !!submittingModuleKey}
                              className={[
                                "inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100",
                                !hasOpenedPdf || submittingModuleKey
                                  ? "cursor-not-allowed opacity-60"
                                  : "",
                              ].join(" ")}
                            >
                              Retake Quiz
                            </button>
                          )}
                        </div>
                      </form>
                    </div>
                  </article>
                );
              })
            )}
          </section>
        </div>

        <div className="mt-8 rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">
                Next Step
              </div>
              <h3 className="mt-2 text-2xl font-bold text-slate-900">
                Finish training and continue
              </h3>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                Once all 6 required modules are passed, continue to the onboarding
                completion page.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleDownloadCertificate}
                disabled={!allRequiredComplete || isDownloadingCertificate}
                className={[
                  "inline-flex items-center justify-center rounded-full px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] transition",
                  !allRequiredComplete || isDownloadingCertificate
                    ? "cursor-not-allowed bg-slate-200 text-slate-500"
                    : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                {isDownloadingCertificate
                  ? "Generating Certificate..."
                  : "Download Training Certificate"}
              </button>

              {allRequiredComplete ? (
                <Link
                  href="/onboarding-complete"
                  onMouseDown={handleContinueMouseDown}
                  className="inline-flex items-center justify-center rounded-full bg-teal-700 px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] text-white shadow-[0_16px_36px_rgba(15,118,110,0.28)] hover:bg-teal-600"
                >
                  Continue to Complete
                </Link>
              ) : (
                <span className="inline-flex cursor-not-allowed items-center justify-center rounded-full bg-slate-200 px-6 py-4 text-sm font-bold uppercase tracking-[0.12em] text-slate-500">
                  Continue to Complete
                </span>
              )}
            </div>
          </div>
        </div>

        {activePdfModule && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 px-4 py-6">
            <div className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">
                    Training Material
                  </div>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">
                    {activePdfModule.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setActivePdfModule(null)}
                  className="inline-flex items-center justify-center rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-slate-700 transition hover:bg-slate-100"
                >
                  Close
                </button>
              </div>

              <div
                className="min-h-[70vh] bg-slate-100 p-4"
                onContextMenu={(event) => event.preventDefault()}
              >
                <iframe
                  src={`${activePdfModule.pdf_url || "/employee-handbook.pdf"}#toolbar=0&navpanes=0&scrollbar=0`}
                  title={`${activePdfModule.title} PDF`}
                  className="h-full min-h-[66vh] w-full rounded-[20px] border border-slate-200 bg-white"
                  onContextMenu={(event) => event.preventDefault()}
                />
              </div>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
