# AGENTS.md

## Project rules
- This is a Saintly Home Health internal app.
- Stack: Next.js App Router, TypeScript, Supabase.
- Preserve existing working functionality unless the task explicitly asks for a refactor.
- Prefer the smallest safe patch over broad rewrites.
- Do not change database schema, env vars, auth, or storage policies unless explicitly requested.
- Do not rename routes, components, or CSS classes unless necessary.
- Keep existing branding and layout intact.

## Editing rules
- First inspect all related files before editing.
- Explain which files will be changed and why.
- Make the minimum viable patch.
- After editing, run relevant checks and report exactly what changed.
- If a change could break another flow, call it out before applying it.

## For this repo specifically
- Be careful with Supabase queries, row-level security, storage uploads, and admin portal flows.
- Preserve onboarding, compliance, skills competency, performance evaluation, and PDF/export flows unless the task is specifically about them.
- Do not remove existing form fields or database mappings without explicit instruction.
- Keep admin workflows easy for non-technical staff.

## Preferred workflow
- For small fixes: patch only the affected code.
- For bigger work: inspect the full flow first, then patch.
- Always summarize:
  1. what was wrong
  2. what files were changed
  3. what to test