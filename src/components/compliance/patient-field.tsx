"use client";

import { useEffect, useState } from "react";

import { searchCompliancePatients } from "@/lib/compliance/actions";
import { Field, TextInput } from "@/components/compliance/ui";

export function PatientField({
  defaultId,
  defaultName,
  required,
}: {
  defaultId?: string | null;
  defaultName?: string | null;
  required?: boolean;
}) {
  const [query, setQuery] = useState(defaultName ?? "");
  const [patientId, setPatientId] = useState(defaultId ?? "");
  const [hits, setHits] = useState<{ id: string; name: string }[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handle = window.setTimeout(async () => {
      if (query.trim().length < 2) {
        setHits([]);
        return;
      }
      const rows = await searchCompliancePatients(query);
      setHits(rows);
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  return (
    <div className="relative">
      <Field label={required ? "Patient" : "Patient (optional)"}>
        <TextInput
          value={query}
          required={required}
          placeholder="Search patients"
          autoComplete="off"
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setQuery(event.target.value);
            setPatientId("");
            setOpen(true);
          }}
        />
      </Field>
      <input type="hidden" name="patient_id" value={patientId} />
      <input type="hidden" name="patient_name" value={query} />
      {open && hits.length > 0 ? (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
          {hits.map((hit) => (
            <li key={hit.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-sky-50"
                onClick={() => {
                  setQuery(hit.name);
                  setPatientId(hit.id);
                  setOpen(false);
                }}
              >
                {hit.name}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
