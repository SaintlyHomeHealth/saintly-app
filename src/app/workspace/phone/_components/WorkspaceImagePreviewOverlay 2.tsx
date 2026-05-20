"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

type Props = {
  open: boolean;
  /** Authenticated `/api/workspace/...` URL or signed path (cookie session). */
  src: string;
  alt?: string;
  onClose: () => void;
};

const SWIPE_DOWN_PX = 72;

/** Full-screen workspace image viewer for WebView/mobile (no reliance on opening new Safari tabs). */
export function WorkspaceImagePreviewOverlay(props: Props) {
  const { open, src, alt = "", onClose } = props;
  const touchStartYRef = useRef<number | null>(null);

  const safeClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") safeClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, safeClose]);

  if (!open || !src) return null;

  return (
    <div
      className="fixed inset-0 z-[240] flex flex-col bg-black/94"
      role="dialog"
      aria-modal="true"
      aria-label="Image preview"
    >
      <div
        className="relative z-[2] flex shrink-0 justify-end px-[max(12px,env(safe-area-inset-right))] pb-2 pt-[max(14px,env(safe-area-inset-top))]"
      >
        <button
          type="button"
          onClick={() => safeClose()}
          aria-label="Close image"
          title="Close"
          className="inline-flex h-11 min-w-[2.75rem] items-center justify-center rounded-full border border-white/25 bg-black/55 text-white shadow-lg shadow-black/50 backdrop-blur-sm transition hover:bg-white/15 active:scale-[0.97]"
        >
          <X className="h-6 w-6" aria-hidden strokeWidth={2} />
        </button>
      </div>

      <div
        className="relative z-[1] flex min-h-0 flex-1 flex-col px-3 pb-[max(16px,env(safe-area-inset-bottom))]"
        role="presentation"
        onClick={() => safeClose()}
        onTouchStart={(e) => {
          touchStartYRef.current = e.touches[0] ? e.touches[0].clientY : null;
        }}
        onTouchEnd={(e) => {
          const start = touchStartYRef.current;
          touchStartYRef.current = null;
          const endTouch = e.changedTouches[0];
          if (start == null || !endTouch) return;
          if (endTouch.clientY - start > SWIPE_DOWN_PX) {
            safeClose();
          }
        }}
      >
        <div className="flex flex-1 items-center justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element -- full-screen authenticated preview */}
          <img
            src={src}
            alt={alt || "attachment"}
            className="max-h-full max-w-full object-contain"
            draggable={false}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        <p className="mt-2 shrink-0 text-center text-[11px] text-white/65">Tap outside or swipe down to close</p>
      </div>
    </div>
  );
}
