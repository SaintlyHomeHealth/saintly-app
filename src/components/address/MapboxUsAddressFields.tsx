"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

type Defaults = {
  address_line_1: string;
  address_line_2: string;
  city: string;
  state: string;
  zip: string;
};

type Suggestion = {
  id: string;
  label: string;
  address_line_1: string;
  city: string;
  state: string;
  zip: string;
};

type ApiOk = { suggestions: Suggestion[] };
type ApiErr = { error: string };

const DEBOUNCE_MS = 280;
const MIN_CHARS = 3;

export function MapboxUsAddressFields(props: {
  inputClassName: string;
  defaults: Defaults;
}) {
  const { inputClassName, defaults } = props;
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [addr1, setAddr1] = useState(defaults.address_line_1);
  const [addr2, setAddr2] = useState(defaults.address_line_2);
  const [city, setCity] = useState(defaults.city);
  const [state, setState] = useState(defaults.state);
  const [zip, setZip] = useState(defaults.zip);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [configError, setConfigError] = useState(false);

  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    if (q.trim().length < MIN_CHARS) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const ac = new AbortController();
      abortRef.current = ac;
      setLoading(true);
      try {
        const u = new URL("/api/mapbox/address-suggest", window.location.origin);
        u.searchParams.set("q", q.trim());
        const res = await fetch(u.toString(), { signal: ac.signal, credentials: "same-origin" });
        if (res.status === 503) {
          const j = (await res.json()) as ApiErr;
          if (j.error === "mapbox_not_configured") setConfigError(true);
          setSuggestions([]);
          return;
        }
        if (!res.ok) {
          setSuggestions([]);
          return;
        }
        const data = (await res.json()) as ApiOk;
        setConfigError(false);
        setSuggestions(Array.isArray(data.suggestions) ? data.suggestions : []);
        setHighlight(0);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  useEffect(() => {
    function onDocMouseDown(ev: MouseEvent) {
      const el = wrapRef.current;
      if (!el || !ev.target) return;
      if (!el.contains(ev.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, []);

  function applySuggestion(s: Suggestion) {
    setAddr1(s.address_line_1);
    setCity(s.city);
    setState(s.state);
    setZip(s.zip);
    setSuggestions([]);
    setOpen(false);
  }

  return (
    <>
      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
        Address line 1
        <div className="relative" ref={wrapRef}>
          <input
            name="address_line_1"
            autoComplete="address-line1"
            className={inputClassName}
            value={addr1}
            onChange={(e) => {
              const v = e.target.value;
              setAddr1(v);
              setOpen(true);
              fetchSuggestions(v);
            }}
            onFocus={() => {
              if (addr1.trim().length >= MIN_CHARS) setOpen(true);
            }}
            onBlur={() => {
              window.setTimeout(() => {
                if (!wrapRef.current?.contains(document.activeElement)) setOpen(false);
              }, 0);
            }}
            onKeyDown={(e) => {
              if (!open || suggestions.length === 0) return;
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setHighlight((h) => Math.min(suggestions.length - 1, h + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setHighlight((h) => Math.max(0, h - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                const s = suggestions[highlight];
                if (s) applySuggestion(s);
              } else if (e.key === "Escape") {
                setOpen(false);
              }
            }}
            role="combobox"
            aria-expanded={open && suggestions.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
          />
          {loading ? (
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-medium text-slate-400">
              …
            </span>
          ) : null}
          {open && suggestions.length > 0 ? (
            <ul
              id={listId}
              role="listbox"
              className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg ring-1 ring-black/5"
            >
              {suggestions.map((s, i) => (
                <li key={s.id} role="presentation">
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === highlight}
                    className={`flex w-full cursor-pointer flex-col gap-0.5 px-3 py-2 text-left hover:bg-slate-50 ${
                      i === highlight ? "bg-slate-50" : ""
                    }`}
                    onMouseEnter={() => setHighlight(i)}
                    onMouseDown={(ev) => {
                      ev.preventDefault();
                      applySuggestion(s);
                    }}
                  >
                    <span className="font-medium text-slate-900">{s.address_line_1}</span>
                    <span className="text-xs text-slate-500">
                      {[s.city, s.state, s.zip].filter(Boolean).join(", ") || s.label}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
        <p className="mt-1 text-[10px] font-normal text-slate-500">
          Start typing a US street address for suggestions, or enter manually.
          {configError ? (
            <span className="block text-amber-700">
              Address search is not configured (add MAPBOX_ACCESS_TOKEN). Manual entry still works.
            </span>
          ) : null}
        </p>
      </label>

      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
        Address line 2
        <input
          name="address_line_2"
          autoComplete="address-line2"
          className={inputClassName}
          value={addr2}
          onChange={(e) => setAddr2(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
        City
        <input
          name="city"
          autoComplete="address-level2"
          className={inputClassName}
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600">
        State
        <input
          name="state"
          autoComplete="address-level1"
          className={inputClassName}
          value={state}
          onChange={(e) => setState(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-0.5 text-[11px] font-medium text-slate-600 sm:col-span-2">
        ZIP
        <input
          name="zip"
          autoComplete="postal-code"
          className={inputClassName}
          value={zip}
          onChange={(e) => setZip(e.target.value)}
        />
      </label>
    </>
  );
}
