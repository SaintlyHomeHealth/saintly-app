import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  try {
    const { applicantId } = await req.json();

    if (!applicantId) {
      return NextResponse.json({ error: "Missing applicantId" }, { status: 400 });
    }

    const today = new Date();

    const oneYear = new Date();
    oneYear.setFullYear(today.getFullYear() + 1);

    const thirtyDays = new Date();
    thirtyDays.setDate(today.getDate() + 30);

    const events = [
      {
        event_type: "annual_checklist",
        event_title: "Annual Checklist",
        due_date: oneYear,
      },
      {
        event_type: "skills_checklist",
        event_title: "Skills Competency",
        due_date: oneYear,
      },
      {
        event_type: "annual_contract_review",
        event_title: "Annual Contract Review",
        due_date: oneYear,
      },
      {
        event_type: "annual_performance_evaluation",
        event_title: "Performance Evaluation",
        due_date: oneYear,
      },
      {
        event_type: "joint_visit",
        event_title: "Joint Visit",
        due_date: thirtyDays,
      },
    ];

    const rows = events.map((e) => ({
      applicant_id: applicantId,
      event_type: e.event_type,
      event_title: e.event_title,
      status: "pending",
      due_date: e.due_date.toISOString(),
      reminder_date: new Date(
        e.due_date.getTime() - 7 * 24 * 60 * 60 * 1000
      ).toISOString(),
    }));

    const { error } = await supabase
      .from("admin_compliance_events")
      .insert(rows);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create events" }, { status: 500 });
  }
}