import { NextResponse } from "next/server";

import { processApplicantFileUpload } from "@/lib/applicant-file-upload-server";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const result = await processApplicantFileUpload(formData);

    if (!result.success) {
      return NextResponse.json(result.body, { status: result.status });
    }

    return NextResponse.json({
      success: true,
      file: result.file,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: "Upload failed",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
