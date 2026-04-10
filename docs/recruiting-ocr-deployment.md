# Recruiting resume OCR — deployment notes

## Vercel / serverless and `@napi-rs/canvas`

Vercel Node Functions **can** load some native Node addons when the correct **Linux** prebuild is installed and the package is **externalized** from the bundler (`serverExternalPackages`). There is **no** official guarantee that every native module will resolve at runtime: layout, `import.meta.url` resolution, and optional platform binaries can still cause `require("@napi-rs/canvas")` to fail.

**Observed on production:** `@napi-rs/canvas` does not load in the current deployment. Scanned-PDF OCR (pdf.js render → PNG → Tesseract) **depends on that native canvas**. Until a supported runtime is used, **treat this OCR path as incompatible with the current Vercel serverless target** for this app.

## Current app behavior

- **Text-layer PDFs** — still parsed via direct text extraction.
- **Scanned / image PDFs** — OCR is **not** run when native canvas is unavailable; the pipeline **skips OCR intentionally** (no silent `ocrPdfBuffer` attempt for that case when direct text is short).
- **Users** see an explicit message that the file appears image-based and auto-fill is limited.

## Long-term options (pick one)

### Option A (recommended): Separate Node service

Run OCR in **Docker / VPS / Railway** (full Node + native canvas), expose an HTTP API, call from the app only for PDFs that need it.

- Pros: Same stack as local; predictable native deps.
- Cons: Extra service to deploy and secure.

### Option B: External OCR API

Use **AWS Textract**, **Google Vision**, **Azure Document Intelligence**, etc., from the serverless app (no local canvas).

- Pros: Fits serverless; scales.
- Cons: Cost, privacy review, integration work.

### Option C: Accept manual entry for scanned PDFs on Vercel

Keep current behavior: no in-process OCR in production; staff complete the form manually.

- Pros: Simplest operationally.
- Cons: No auto-fill for scans.

## What we are not doing

We are **not** continuing to patch `@napi-rs/canvas` into Vercel until it loads. Production logs are the source of truth; if the native module does not load, use one of the options above.
