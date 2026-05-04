import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { skillsCompetencyDisciplines } from "@/lib/skills-competency";
import PrintButton from "@/components/admin/print-button";
import { formatAppDate, formatAppDateTime } from "@/lib/datetime/app-timezone";

type PageProps = {
  params: Promise<{ employeeId: string }>;
  searchParams: Promise<{ eventId?: string }>;
};

type ComplianceEvent = {
  id: string;
  event_title: string | null;
  due_date: string | null;
  completed_at: string | null;
};

type AdminFormRecord = {
  id: string;
  status: string | null;
  finalized_at: string | null;
  compliance_event_id: string | null;
  form_data: {
    discipline?: string;
    employee_name?: string;
    evaluator_name?: string;
    evaluation_date?: string;
    setting?: string;
    notes?: string;
    items?: Record<string, string>;
  } | null;
};

function formatDate(dateString?: string | null) {
  if (!dateString) return "—";
  return formatAppDate(dateString, "—", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(dateString?: string | null) {
  if (!dateString) return "—";
  return formatAppDateTime(dateString, "—");
}

function getRatingLabel(selectedDiscipline: any, value?: string) {
  if (!value) return "Not scored";
  const match = selectedDiscipline?.scaleOptions?.find(
    (o: any) => o.value === value
  );
  return match ? `${value} — ${match.label}` : value;
}

export default async function SkillsCompetencyPrintPage({
  params,
  searchParams,
}: PageProps) {
  const { employeeId } = await params;
  const { eventId } = await searchParams;

  const { data: employee } = await supabase
    .from("applicants")
    .select("first_name, last_name")
    .eq("id", employeeId)
    .single();

  const { data: event } = eventId
    ? await supabase
        .from("admin_compliance_events")
        .select("*")
        .eq("id", eventId)
        .maybeSingle()
    : await supabase
        .from("admin_compliance_events")
        .select("*")
        .eq("applicant_id", employeeId)
        .eq("event_type", "skills_checklist")
        .order("due_date", { ascending: false })
        .limit(1)
        .maybeSingle();

  let formQuery = supabase
    .from("employee_admin_forms")
    .select("*")
    .eq("employee_id", employeeId)
    .eq("form_type", "skills_competency");

  formQuery = event?.id
    ? formQuery.eq("compliance_event_id", event.id)
    : formQuery.is("compliance_event_id", null);

  const { data: form } = await formQuery
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle<AdminFormRecord>();

  if (!form) {
    return <div className="p-6">No Skills Competency found</div>;
  }

  const formData = form.form_data || {};
  const selectedDiscipline =
    skillsCompetencyDisciplines.find(
      (d) => d.id === String(formData.discipline || "").toLowerCase()
    ) || skillsCompetencyDisciplines[0];

  const items = selectedDiscipline.items || [];
  const answered = formData.items || {};

  const completed = items.filter((i) => !!answered[i.id]).length;
  const total = items.length;
  const percent = total ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="p-4 print:p-0">
      <div className="print:hidden flex justify-between mb-4">
        <Link
          href={`/admin/employees/${employeeId}/forms/skills-competency`}
          className="px-4 py-2 bg-slate-200 rounded"
        >
          Back
        </Link>
        <PrintButton />
      </div>

      <div className="bg-white p-8 rounded shadow print:shadow-none">
        <h1 className="text-2xl font-bold mb-4">
          Skills Competency Evaluation
        </h1>

        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>Employee: {formData.employee_name}</div>
          <div>Evaluator: {formData.evaluator_name}</div>
          <div>Date: {formatDate(formData.evaluation_date)}</div>
          <div>Discipline: {selectedDiscipline.label}</div>
          <div>Setting: {formData.setting}</div>
          <div>Completion: {percent}%</div>
        </div>

        <div className="border-t pt-4">
          {items.map((item, i) => (
            <div key={item.id} className="flex justify-between py-2 border-b">
              <div>{i + 1}. {item.label}</div>
              <div>{getRatingLabel(selectedDiscipline, answered[item.id])}</div>
            </div>
          ))}
        </div>

        <div className="mt-6">
          <h2 className="font-semibold mb-2">Notes</h2>
          <div className="border p-3">
            {formData.notes || "No notes"}
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 gap-8">
          <div>
            <div className="border-b mt-10" />
            <p className="text-sm">Employee Signature</p>
          </div>
          <div>
            <div className="border-b mt-10" />
            <p className="text-sm">Evaluator Signature</p>
          </div>
        </div>
      </div>
    </div>
  );
}