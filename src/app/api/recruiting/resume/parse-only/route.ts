import { NextResponse } from "next/server";

import { parseResumePlainText } from "@/lib/recruiting/resume-parse-heuristics";
import type { ParsedResumeSuggestions } from "@/lib/recruiting/resume-parse-types";
import { extractResumeText } from "@/lib/recruiting/resume-text-extract";
import { getStaffProfile, isManagerOrHigher } from "@/lib/staff-profile";

const MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_EXT = [".pdf", ".doc", ".docx"] as const;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/octet-stream",
  "",
]);

function hasAllowedExtension(name: string): boolean {
  const lower = name.toLowerCase();
  return ALLOWED_EXT.some((ext) => lower.endsWith(ext));
}

function mimeOk(mime: string, filename: string): boolean {
  if (ALLOWED_MIME.has(mime)) return true;
  const lower = filename.toLowerCase();
  if (lower.endsWith(".docx") && (mime === "application/zip" || mime === "application/x-zip-compressed")) {
    return true;
  }
  return false;
}

function sanitizeOriginalName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? "resume";
  const cleaned = base.replace(/[^a-zA-Z0-9._\- ]/g, "_").trim();
  return cleaned.slice(0, 180) || "resume";
}

export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "Choose a resume file" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10 MB)" }, { status: 400 });
  }

  const originalName = file.name || "resume";
  if (!hasAllowedExtension(originalName)) {
    return NextResponse.json({ error: "Only PDF, DOC, or DOCX files are allowed" }, { status: 400 });
  }

  const mime = typeof file.type === "string" ? file.type.trim() : "";
  if (!mimeOk(mime, originalName)) {
    return NextResponse.json({ error: "Unsupported file type" }, { status: 400 });
  }

  const safeName = sanitizeOriginalName(originalName);
  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  let parseOut: {
    ok: boolean;
    suggestions: ParsedResumeSuggestions | null;
    warning?: string;
  } = { ok: false, suggestions: null };

  try {
    const { text, error: extErr } = await extractResumeText(buffer, safeName);
    const minLen = 20;
    if (!extErr && text && text.length >= minLen) {
      const suggestions = parseResumePlainText(text);
      parseOut = { ok: true, suggestions };
    } else {
      parseOut = {
        ok: false,
        suggestions: null,
        warning: extErr || "Could not extract enough text from this file for auto-fill.",
      };
    }
  } catch (e) {
    parseOut = {
      ok: false,
      suggestions: null,
      warning: e instanceof Error ? e.message : "Parsing failed",
    };
  }

  return NextResponse.json({
    ok: true,
    resume_file_name: safeName,
    parse: parseOut,
  });
}
