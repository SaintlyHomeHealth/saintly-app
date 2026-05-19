"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

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

function formatFullAddress(s: Suggestion): string {
  if (s.label.trim()) return s.label.trim();
  return [s.address_line_1, [s.city, s.state].filter(Boolean).join(", "), s.zip].filter(Boolean).join(", ");
}

export function MapboxUsAddressInput(props: {
  name?: string;
  required?: boolean;
  className: string;
  defaultValue?: string;
  labelClassName?: string;
  helperClassName?: string;
}) {
  const {
    name = "address",
    required = false,
    className,
    defaultValue = "",
    labelClassName = "sm:col-span-2 flex flex-col text-xs font-medium text-slate-600",
    helperClassName = "mt-1 text-[10px] font-normal text-slate-500",
  } = props;

  const listId = useId();
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [value, setValue] = useState(defaultValue);
  const [structured, setStructured] = useState({
    address_line_1: "",
    city: "",
    state: "",
    zip: "",
  });

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
    setValue(formatFullAddress(s));
    setStructured({
      address_line_1: s.address_line_1,
      city: s.city,
      state: s.state,
      zip: s.zip,
    });
    setSuggestions([]);
    setOpen(false);
    inputRef.current?.focus();
  }

  function handleManualChange(next: string) {
    setValue(next);
    setStructured({ address_line_1: "", city: "", state: "", zip: "" });
    setOpen(true);
    fetchSuggestions(next);
  }

  return (
    <label className={labelClassName}>
      Address *
      <div className="relative" ref={wrapRef}>
        <input
          ref={inputRef}
          name={name}
          required={required}
          autoComplete="street-address"
          className={className}
          value={value}
          onChange={(e) => handleManualChange(e.target.value)}
          onFocus={() => {
            inputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
            if (value.trim().length >= MIN_CHARS) setOpen(true);
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
            className="absolute z-[100] mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 text-sm shadow-lg ring-1 ring-black/5"
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
      <input type="hidden" name="address_line_1" value={structured.address_line_1} />
      <input type="hidden" name="city" value={structured.city} />
      <input type="hidden" name="state" value={structured.state} />
      <input type="hidden" name="zip" value={structured.zip} />
      <p className={helperClassName}>
        Start typing a US street address for suggestions, or enter manually.
        {configError ? (
          <span className="block text-amber-700">
            Address search is not configured (add MAPBOX_ACCESS_TOKEN). Manual entry still works.
          </span>
        ) : null}
      </p>
    </label>
  );
}
