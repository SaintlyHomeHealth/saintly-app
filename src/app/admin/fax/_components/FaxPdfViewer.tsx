"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { loadPdfFromUrl } from "@/lib/pdf-sign/pdfjs-browser";
import { fx } from "@/app/admin/fax/_components/fax-tokens";

type FaxPdfViewerProps = {
  pdfUrl: string | null;
  initialPage?: number;
};

export function FaxPdfViewer({ pdfUrl, initialPage = 1 }: FaxPdfViewerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pageCount, setPageCount] = useState(0);
  const [page, setPage] = useState(Math.max(1, initialPage));
  const [fit, setFit] = useState<"width" | "page">("width");
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fullscreen, setFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(pdfUrl));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const thumbsRef = useRef<HTMLDivElement>(null);

  const pagesRef = useRef<Awaited<ReturnType<typeof loadPdfFromUrl>> | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!pdfUrl) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void loadPdfFromUrl(pdfUrl)
      .then((doc) => {
        if (cancelled) {
          void doc.destroy();
          return;
        }
        pagesRef.current = doc;
        setPageCount(doc.pages.length);
        setPage((p) => Math.min(Math.max(1, p), doc.pages.length || 1));
        setLoading(false);
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load PDF");
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
      const doc = pagesRef.current;
      pagesRef.current = null;
      if (doc) void doc.destroy();
    };
  }, [pdfUrl]);

  useEffect(() => {
    const doc = pagesRef.current;
    const canvas = canvasRef.current;
    const host = hostRef.current;
    if (!doc || !canvas || !host || pageCount === 0) return;
    const pdfPage = doc.pages[page - 1];
    if (!pdfPage) return;
    const width = fit === "width" ? host.clientWidth - 8 : Math.min(host.clientWidth - 8, 720);
    void pdfPage.renderToCanvas(canvas, Math.max(240, width * zoom)).catch(() => {
      setError("Could not render this page.");
    });
  }, [page, pageCount, fit, zoom, rotation]);

  function commitPage(next: number) {
    const bounded = Math.min(pageCount || 1, Math.max(1, next));
    setPage(bounded);
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(bounded));
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      if (e.key === "ArrowRight") commitPage(page + 1);
      if (e.key === "ArrowLeft") commitPage(page - 1);
      if (e.key === "f" || e.key === "F") setFullscreen((v) => !v);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const thumbs = useMemo(() => Array.from({ length: pageCount }, (_, i) => i + 1), [pageCount]);

  if (!pdfUrl) {
    return (
      <div className="flex h-full items-center justify-center text-[13px] text-[color:var(--fx-text-muted)]">
        No PDF available.
      </div>
    );
  }

  return (
    <div className={`flex h-full min-h-0 flex-col ${fullscreen ? "fixed inset-0 z-[80] bg-[var(--fx-bg)] p-3" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 border-b px-2 py-1.5 [border-color:var(--fx-border)]">
        <label className="flex items-center gap-1 text-[12px] text-[color:var(--fx-text-muted)]">
          Page
          <input
            type="number"
            min={1}
            max={pageCount || 1}
            value={page}
            onChange={(e) => commitPage(Number(e.target.value))}
            className={`${fx.input} w-16 tabular-nums`}
          />
          <span className="tabular-nums">/ {pageCount || "—"}</span>
        </label>
        <button type="button" className={fx.btnGhost} onClick={() => setFit("width")}>
          Fit width
        </button>
        <button type="button" className={fx.btnGhost} onClick={() => setFit("page")}>
          Fit page
        </button>
        <button type="button" className={fx.btnGhost} onClick={() => setZoom((z) => Math.min(2.5, z + 0.15))}>
          +
        </button>
        <button type="button" className={fx.btnGhost} onClick={() => setZoom((z) => Math.max(0.5, z - 0.15))}>
          −
        </button>
        <button type="button" className={fx.btnGhost} onClick={() => setRotation((r) => (r + 90) % 360)}>
          Rotate
        </button>
        <button type="button" className={fx.btnGhost} onClick={() => setFullscreen((v) => !v)}>
          {fullscreen ? "Exit" : "Full screen"}
        </button>
        <a href={pdfUrl} target="_blank" rel="noreferrer" className={fx.btnGhost}>
          Download
        </a>
      </div>
      <div className="flex min-h-0 flex-1">
        <div ref={thumbsRef} className="w-16 overflow-y-auto border-r p-1 [border-color:var(--fx-border)]">
          {thumbs.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => commitPage(n)}
              className={`mb-1 w-full rounded-[8px] border py-2 text-[11px] tabular-nums ${
                n === page ? "border-[color:var(--fx-accent)] bg-slate-100" : "[border-color:var(--fx-border)]"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        <div ref={hostRef} className="min-w-0 flex-1 overflow-auto bg-slate-100 p-2">
          {loading ? (
            <div className="space-y-2 p-4">
              <div className="h-8 animate-pulse rounded-[8px] bg-slate-200" />
              <div className="h-[480px] animate-pulse rounded-[8px] bg-slate-200" />
            </div>
          ) : error ? (
            <p className="p-6 text-[13px] text-rose-800">{error}</p>
          ) : (
            <canvas
              ref={canvasRef}
              className="mx-auto max-w-full bg-white shadow-sm"
              style={{ transform: `rotate(${rotation}deg)` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export function jumpFaxViewerToPage(page: number) {
  const input = document.querySelector<HTMLInputElement>('input[type="number"][min="1"]');
  if (input) {
    input.value = String(page);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }
}
