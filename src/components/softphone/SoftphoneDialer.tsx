"use client";

import { useEffect, useRef } from "react";
import { Delete } from "lucide-react";

import { useWorkspaceSoftphone } from "@/components/softphone/WorkspaceSoftphoneProvider";

const DIALPAD_ROWS: ReadonlyArray<ReadonlyArray<{ digit: string; sub?: string }>> = [
  [
    { digit: "1", sub: "" },
    { digit: "2", sub: "ABC" },
    { digit: "3", sub: "DEF" },
  ],
  [
    { digit: "4", sub: "GHI" },
    { digit: "5", sub: "JKL" },
    { digit: "6", sub: "MNO" },
  ],
  [
    { digit: "7", sub: "PQRS" },
    { digit: "8", sub: "TUV" },
    { digit: "9", sub: "WXYZ" },
  ],
  [
    { digit: "*", sub: "" },
    { digit: "0", sub: "+" },
    { digit: "#", sub: "" },
  ],
];

/** Large display line for keypad — US-style grouping when input is digits-only (plus optional +). */
function formatDialpadDisplay(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/[*#]/.test(t)) {
    return t;
  }
  if (t.startsWith("+")) {
    const rest = t.slice(1).replace(/\D/g, "");
    if (!rest) return "+";
    if (rest.length <= 10) {
      const d = rest;
      if (d.length <= 3) return `+${d}`;
      if (d.length <= 6) return `+${d.slice(0, 3)} ${d.slice(3)}`;
      return `+${d.slice(0, 3)} ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    return `+${rest}`;
  }
  const d = t.replace(/\D/g, "");
  if (!d) return t;
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  if (d.length <= 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6, 10)}${d.length > 10 ? ` ${d.slice(10)}` : ""}`;
}

export type SoftphoneDialerProps = {
  staffDisplayName: string;
  /** Workspace keypad: premium dialpad UI; default keeps the full softphone panel (admin / calls). */
  variant?: "default" | "keypad";
  /** Seed the number field once (e.g. deep link from workspace leads). */
  initialDigits?: string;
  /** After the device is ready, place one outbound call using `initialDigits` (Twilio softphone). */
  autoPlaceCall?: boolean;
};

export function SoftphoneDialer({
  staffDisplayName,
  variant = "default",
  initialDigits,
  autoPlaceCall = false,
}: SoftphoneDialerProps) {
  const {
    digits,
    setDigits,
    listenState,
    status,
    hint,
    incomingCallerContactName,
    incomingCallerNumberFormatted,
    incomingCallerRawFrom,
    ringtoneUnlocked,
    busy,
    canDial,
    incoming,
    startCall,
    hangUp,
    answerIncoming,
    rejectIncoming,
    testRingtone,
    unlockRingtoneFromGesture,
  } = useWorkspaceSoftphone();
  const autoPlaceStartedRef = useRef(false);

  useEffect(() => {
    const seed = (initialDigits ?? "").trim();
    if (!seed) return;
    setDigits(seed);
  }, [initialDigits, setDigits]);

  useEffect(() => {
    if (!autoPlaceCall || autoPlaceStartedRef.current) return;
    if (listenState !== "ready") return;
    if (status !== "idle" || incoming) return;
    const seed = (initialDigits ?? "").trim();
    if (!seed) return;
    autoPlaceStartedRef.current = true;
    queueMicrotask(() => {
      void startCall(seed);
    });
  }, [autoPlaceCall, initialDigits, listenState, status, incoming, startCall]);

  const dialInputLocked = (busy && status !== "in_call") || Boolean(incoming);
  const showCallButton = !busy;
  const keypadDisabled = dialInputLocked;

  const defaultPanel = (
    <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-800">Softphone</p>
          <p className="mt-0.5 text-sm text-slate-700">
            Signed in as <span className="font-medium text-slate-900">{staffDisplayName}</span>
          </p>
          <p className="mt-1 max-w-xl text-xs text-slate-500">
            {listenState === "ready"
              ? "Listening for inbound calls. Outbound uses the Saintly caller ID and is logged as outbound."
              : listenState === "loading"
                ? "Connecting to phone service…"
                : "Inbound listen unavailable; outbound may still work after you place a call."}
          </p>
          {!ringtoneUnlocked ? (
            <p className="mt-1 max-w-xl text-xs text-amber-800">
              Tap this panel or <span className="font-medium">Test Ringtone</span> once to unlock incoming ring
              sound on this device (mobile browsers require a gesture).
            </p>
          ) : null}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[16rem]">
          <label className="block text-xs font-semibold text-slate-600" htmlFor="softphone-dial-input">
            Number
          </label>
          <input
            id="softphone-dial-input"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            placeholder="+1 or 10-digit"
            value={digits}
            disabled={dialInputLocked}
            onChange={(e) => setDigits(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-inner outline-none ring-emerald-500/30 focus:ring-2"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void testRingtone()}
              disabled={Boolean(incoming)}
              className="inline-flex flex-1 items-center justify-center rounded-lg border border-emerald-400/80 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 shadow-sm transition hover:bg-emerald-50 disabled:opacity-50 sm:flex-none"
            >
              Test Ringtone
            </button>
            {incoming ? (
              <>
                <button
                  type="button"
                  onClick={() => void answerIncoming()}
                  className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 sm:flex-none"
                >
                  Answer
                </button>
                <button
                  type="button"
                  onClick={() => void rejectIncoming()}
                  className="inline-flex flex-1 items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 sm:flex-none"
                >
                  Decline
                </button>
              </>
            ) : null}
            {showCallButton ? (
              <button
                type="button"
                onClick={() => void startCall()}
                className="inline-flex flex-1 items-center justify-center rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:opacity-50 sm:flex-none"
                disabled={!digits.trim() || !canDial}
              >
                Call
              </button>
            ) : null}
            {status === "in_call" ? (
              <button
                type="button"
                onClick={hangUp}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-semibold text-red-900 shadow-sm transition hover:bg-red-100 sm:flex-none"
              >
                Hang up
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </>
  );

  const keypadPanel = (
    <div className="flex w-full flex-col items-center gap-6">
      <div className="w-full text-center">
        <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate-400">Signed in</p>
        <p className="mt-0.5 text-sm font-medium text-slate-800">{staffDisplayName}</p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
          <p className="text-xs text-slate-500">
            {listenState === "ready"
              ? "Ready for calls"
              : listenState === "loading"
                ? "Connecting…"
                : "Inbound listen limited; outbound still available"}
          </p>
          <span
            className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
              listenState === "ready"
                ? "bg-emerald-100 text-emerald-900"
                : listenState === "loading"
                  ? "bg-slate-100 text-slate-600"
                  : "bg-amber-100 text-amber-900"
            }`}
          >
            {listenState === "ready" ? "Live" : listenState === "loading" ? "…" : "Limited"}
          </span>
        </div>
        {!ringtoneUnlocked ? (
          <p className="mt-2 text-xs text-amber-800">
            Tap the keypad or <span className="font-medium">Test ringtone</span> once to hear incoming rings on this
            device.
          </p>
        ) : null}
      </div>

      <div
        className="flex min-h-[5rem] w-full max-w-sm items-center justify-center rounded-2xl bg-slate-50/80 px-2 ring-1 ring-slate-200/80"
        aria-live="polite"
        aria-label="Number entered"
      >
        <p className="max-w-full break-all text-center text-[2rem] font-medium leading-tight tracking-tight text-slate-900 tabular-nums sm:text-[2.2rem]">
          {digits.trim() ? (
            formatDialpadDisplay(digits)
          ) : (
            <span className="text-slate-300">Enter number</span>
          )}
        </p>
      </div>
      <p className="text-center text-[11px] text-slate-500">Use 10 digits or +1 format. Tap Call to place outbound.</p>

      {incoming ? (
        <div className="flex w-full max-w-sm flex-col gap-3">
          <div className="text-center">
            <p className="text-sm font-semibold text-emerald-900">Incoming call</p>
            {incomingCallerContactName ? (
              <p className="mt-1 text-lg font-semibold text-slate-900">{incomingCallerContactName}</p>
            ) : null}
            {incomingCallerNumberFormatted ? (
              <p
                className={`font-mono text-lg font-medium tabular-nums text-slate-900 ${
                  incomingCallerContactName ? "mt-0.5 text-base text-slate-700" : "mt-1"
                }`}
              >
                {incomingCallerNumberFormatted}
              </p>
            ) : null}
            {incomingCallerRawFrom &&
            incomingCallerNumberFormatted &&
            incomingCallerRawFrom !== incomingCallerNumberFormatted &&
            !incomingCallerContactName ? (
              <p className="mt-0.5 font-mono text-xs text-slate-500">{incomingCallerRawFrom}</p>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => void answerIncoming()}
              className="rounded-full bg-emerald-600 py-3.5 text-base font-semibold text-white shadow-md transition hover:bg-emerald-700 active:scale-[0.98]"
            >
              Answer
            </button>
            <button
              type="button"
              onClick={() => void rejectIncoming()}
              className="rounded-full border border-slate-300 bg-white py-3.5 text-base font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.98]"
            >
              Decline
            </button>
          </div>
        </div>
      ) : (
        <>
          <div
            className="grid w-full max-w-[min(100%,20rem)] grid-cols-3 gap-x-5 gap-y-4 px-1"
            role="group"
            aria-label="Dialpad"
          >
            {DIALPAD_ROWS.map((row, ri) =>
              row.map(({ digit, sub }) => (
                <button
                  key={`${ri}-${digit}`}
                  type="button"
                  disabled={keypadDisabled}
                  onClick={() => {
                    void unlockRingtoneFromGesture();
                    setDigits((d) => d + digit);
                  }}
                  className="flex aspect-square max-h-[4.25rem] w-full min-h-[3.5rem] flex-col items-center justify-center rounded-full border border-slate-200/90 bg-slate-50 text-slate-900 shadow-sm transition hover:bg-slate-100 active:scale-[0.96] active:bg-slate-200/90 disabled:pointer-events-none disabled:opacity-40"
                >
                  <span className="text-[1.65rem] font-light leading-none tabular-nums">{digit}</span>
                  {sub ? (
                    <span className="mt-1 text-[0.55rem] font-medium uppercase tracking-wider text-slate-400">
                      {sub}
                    </span>
                  ) : (
                    <span className="mt-1 h-[0.55rem]" aria-hidden />
                  )}
                </button>
              ))
            )}
          </div>

          {status === "in_call" ? (
            <div className="w-full max-w-sm rounded-2xl border border-slate-200/80 bg-slate-50/90 px-3 py-3">
              <p className="text-center text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
                In-call controls
              </p>
              <p className="mt-1 text-center text-[11px] text-slate-500">Mute, hold, and transfer will wire up next.</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["Mute", "Hold", "Transfer"] as const).map((label) => (
                  <button
                    key={label}
                    type="button"
                    disabled
                    aria-disabled="true"
                    title="Coming soon"
                    className="rounded-xl border border-slate-200/90 bg-white py-2.5 text-xs font-semibold text-slate-400"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="flex w-full max-w-sm items-center justify-center gap-4 px-2">
            <button
              type="button"
              disabled={keypadDisabled || !digits.length}
              onClick={() => setDigits((d) => d.slice(0, -1))}
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 active:scale-95 disabled:opacity-30"
              aria-label="Backspace"
            >
              <Delete className="h-6 w-6" strokeWidth={1.75} />
            </button>
            <div className="flex min-h-16 flex-1 items-center justify-center">
              {showCallButton ? (
                <button
                  type="button"
                  onClick={() => void startCall()}
                  disabled={!digits.trim() || !canDial}
                  className="flex h-16 min-w-[min(100%,14rem)] items-center justify-center rounded-full bg-emerald-600 px-10 text-lg font-semibold text-white shadow-lg shadow-emerald-600/25 transition hover:bg-emerald-700 active:scale-[0.98] disabled:opacity-45"
                >
                  Call
                </button>
              ) : null}
              {status === "in_call" ? (
                <button
                  type="button"
                  onClick={hangUp}
                  className="flex h-16 min-w-[min(100%,14rem)] items-center justify-center rounded-full border-2 border-red-400 bg-red-50 px-10 text-lg font-semibold text-red-900 transition hover:bg-red-100 active:scale-[0.98]"
                >
                  Hang up
                </button>
              ) : null}
            </div>
            <div className="h-14 w-14 shrink-0" aria-hidden />
          </div>

          <div className="w-full max-w-sm border-t border-slate-100 pt-5">
            <button
              type="button"
              onClick={() => void testRingtone()}
              disabled={Boolean(incoming)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100 active:bg-slate-200/80 disabled:opacity-45"
            >
              Test ringtone
            </button>
          </div>
        </>
      )}
    </div>
  );

  return (
    <section
      className={
        variant === "keypad"
          ? "w-full"
          : "rounded-2xl border border-emerald-200/80 bg-gradient-to-br from-emerald-50/90 to-white p-4 shadow-sm"
      }
      aria-label="Internal softphone"
      onPointerDownCapture={() => {
        void unlockRingtoneFromGesture();
      }}
    >
      {variant === "keypad" ? keypadPanel : defaultPanel}
      {incoming && variant === "default" ? (
        <p className="mt-3 text-xs font-semibold text-emerald-950">Incoming call — Answer or Decline.</p>
      ) : null}
      {status !== "idle" && status !== "error" ? (
        <p
          className={
            variant === "keypad"
              ? "mt-4 text-center text-xs font-medium text-emerald-800"
              : "mt-3 text-xs font-medium text-emerald-900"
          }
        >
          {status === "fetching_token"
            ? "Preparing secure line…"
            : status === "connecting"
              ? "Connecting…"
              : "In call — use your headset or speakers."}
        </p>
      ) : null}
      {hint ? (
        <p className={variant === "keypad" ? "mt-3 text-center text-sm text-amber-900" : "mt-2 text-xs text-amber-900"}>
          {hint}
        </p>
      ) : null}
    </section>
  );
}
