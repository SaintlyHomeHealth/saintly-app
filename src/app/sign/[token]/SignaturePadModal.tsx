"use client";

import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

type Field = {
  fieldKey: string;
  label: string;
  fieldType: string;
};

const PAD_WIDTH = 600;
const PAD_HEIGHT = 200;

export function SignaturePadModal({
  field,
  recipientName,
  onCancel,
  onApply,
}: {
  field: Field;
  recipientName: string;
  onCancel: () => void;
  onApply: (payload: { imageDataUrl: string | null; typed: string | null }) => void;
}) {
  const [tab, setTab] = useState<"draw" | "type">("draw");
  const [typed, setTyped] = useState(recipientName || "");
  const [hasStrokes, setHasStrokes] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const initCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(PAD_WIDTH * dpr);
    c.height = Math.floor(PAD_HEIGHT * dpr);
    c.style.width = `${PAD_WIDTH}px`;
    c.style.height = `${PAD_HEIGHT}px`;
    const ctx = c.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 2.4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, []);

  useEffect(() => {
    initCanvas();
  }, [initCanvas]);

  function clearPad() {
    initCanvas();
    setHasStrokes(false);
  }

  function getPoint(e: ReactPointerEvent<HTMLCanvasElement>): { x: number; y: number } | null {
    const c = canvasRef.current;
    if (!c) return null;
    const rect = c.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    const c = canvasRef.current;
    if (!c) return;
    drawingRef.current = true;
    const p = getPoint(e);
    if (p) lastPointRef.current = p;
    c.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const p = getPoint(e);
    const last = lastPointRef.current;
    if (!p || !last) return;
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    lastPointRef.current = p;
    if (!hasStrokes) setHasStrokes(true);
  }

  function handlePointerUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    lastPointRef.current = null;
    const c = canvasRef.current;
    try {
      c?.releasePointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
  }

  function handleApply() {
    if (tab === "draw") {
      const c = canvasRef.current;
      if (!c || !hasStrokes) {
        onApply({ imageDataUrl: null, typed: null });
        return;
      }
      const dataUrl = c.toDataURL("image/png");
      onApply({ imageDataUrl: dataUrl, typed: typed.trim() || null });
      return;
    }
    if (!typed.trim()) {
      onApply({ imageDataUrl: null, typed: null });
      return;
    }
    // Render typed signature into a canvas so we have an image to paint on the PDF.
    const c = document.createElement("canvas");
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.floor(PAD_WIDTH * dpr);
    c.height = Math.floor(PAD_HEIGHT * dpr);
    const ctx = c.getContext("2d");
    if (!ctx) {
      onApply({ imageDataUrl: null, typed: typed.trim() });
      return;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PAD_WIDTH, PAD_HEIGHT);
    ctx.fillStyle = "#0f172a";
    ctx.font = '64px "Brush Script MT", "Snell Roundhand", cursive';
    ctx.textBaseline = "middle";
    ctx.textAlign = "center";
    ctx.fillText(typed.trim(), PAD_WIDTH / 2, PAD_HEIGHT / 2);
    const dataUrl = c.toDataURL("image/png");
    onApply({ imageDataUrl: dataUrl, typed: typed.trim() });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-2xl rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-slate-900">
            {field.fieldType === "initials" ? "Add your initials" : "Add your signature"}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            className="text-xs font-semibold text-slate-500 hover:text-slate-700"
          >
            Cancel
          </button>
        </div>
        <div className="mt-4 flex gap-2 text-xs">
          <button
            type="button"
            onClick={() => setTab("draw")}
            className={
              "rounded-full px-3 py-1 font-semibold ring-1 transition " +
              (tab === "draw"
                ? "bg-indigo-600 text-white ring-indigo-600"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
            }
          >
            Draw
          </button>
          <button
            type="button"
            onClick={() => setTab("type")}
            className={
              "rounded-full px-3 py-1 font-semibold ring-1 transition " +
              (tab === "type"
                ? "bg-indigo-600 text-white ring-indigo-600"
                : "bg-white text-slate-700 ring-slate-200 hover:bg-slate-50")
            }
          >
            Type
          </button>
        </div>

        <div className="mt-4">
          {tab === "draw" ? (
            <div>
              <div className="rounded-xl border border-slate-200 bg-slate-100 p-2">
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  className="block w-full touch-none rounded-lg bg-transparent"
                />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <p className="text-xs text-slate-500">Use mouse, finger, or stylus to sign.</p>
                <button
                  type="button"
                  onClick={clearPad}
                  className="text-xs font-semibold text-slate-700 underline-offset-2 hover:underline"
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <div>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder="Type your name"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-base"
              />
              <p
                className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-3xl text-slate-900"
                style={{ fontFamily: '"Brush Script MT", "Snell Roundhand", cursive' }}
              >
                {typed.trim() || "Your signature"}
              </p>
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            className="rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
