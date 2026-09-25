"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type KeyboardEvent } from "react";

import { updateFaxDisplayTitleAction } from "@/app/admin/fax/actions";
import { crmFilterInputCls } from "@/components/admin/crm-admin-list-styles";
import { FAX_DISPLAY_TITLE_HINT, FAX_DISPLAY_TITLE_MAX_LEN } from "@/lib/fax/fax-ehr-filing";

type FaxDisplayTitleEditorProps = {
  faxId: string;
  initialTitle: string | null;
  variant: "row" | "detail";
};

export function FaxDisplayTitleEditor({ faxId, initialTitle, variant }: FaxDisplayTitleEditorProps) {
  const router = useRouter();
  const saved = initialTitle?.trim() ?? "";
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(saved);
  const [syncedSaved, setSyncedSaved] = useState(saved);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const skipBlurSave = useRef(false);

  if (syncedSaved !== saved && !editing) {
    setSyncedSaved(saved);
    setValue(saved);
  }

  function begin() {
    setValue(saved);
    setError(null);
    setEditing(true);
  }

  function cancel() {
    skipBlurSave.current = true;
    setValue(saved);
    setError(null);
    setEditing(false);
  }

  function save() {
    const next = value.replace(/\s+/g, " ").trim();
    if (next === saved) {
      setEditing(false);
      setError(null);
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("faxId", faxId);
      formData.set("displayTitle", next);
      const result = await updateFaxDisplayTitleAction(formData);
      if (!result.ok) {
        setError(result.error ?? "Could not save the record name.");
        setEditing(true);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      skipBlurSave.current = true;
      save();
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  }

  function onBlur() {
    if (skipBlurSave.current) {
      skipBlurSave.current = false;
      return;
    }
    save();
  }

  if (editing) {
    return (
      <div className={variant === "detail" ? "space-y-2" : "min-w-0 py-0.5"} onClick={(event) => event.stopPropagation()}>
        {variant === "detail" ? (
          <label htmlFor={`fax-record-name-${faxId}`} className="text-sm font-bold text-slate-900">
            Alora record name
          </label>
        ) : null}
        <input
          id={variant === "detail" ? `fax-record-name-${faxId}` : undefined}
          autoFocus
          type="text"
          value={value}
          maxLength={FAX_DISPLAY_TITLE_MAX_LEN}
          placeholder={FAX_DISPLAY_TITLE_HINT}
          aria-label="Alora record name"
          disabled={isPending}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={`${crmFilterInputCls} w-full text-sm`}
        />
        <p className="text-[11px] text-slate-500">
          {value.trim().length}/{FAX_DISPLAY_TITLE_MAX_LEN} · {FAX_DISPLAY_TITLE_HINT}
          {isPending ? " · Saving…" : ""}
        </p>
        {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
      </div>
    );
  }

  const button = (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        begin();
      }}
      className={
        variant === "detail"
          ? "w-full rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm hover:border-sky-300 hover:bg-white"
          : "w-full rounded-lg px-0 py-0.5 text-left hover:bg-sky-50/80"
      }
      title="Click to edit. Enter saves."
      aria-label={saved ? `Edit record name ${saved}` : "Add Alora record name"}
    >
      <span className={saved ? "line-clamp-2 break-words font-semibold text-slate-900" : "line-clamp-2 break-words text-sm italic text-slate-400"}>
        {saved || FAX_DISPLAY_TITLE_HINT}
      </span>
    </button>
  );

  if (variant === "detail") {
    return (
      <div className="space-y-2">
        <p className="text-sm font-bold text-slate-900">Alora record name</p>
        {button}
        <p className="text-xs text-slate-500">
          Click to edit, then press Enter to save. Max {FAX_DISPLAY_TITLE_MAX_LEN} characters. This name is separate from the fax note and is used as the PDF filename.
        </p>
        {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className="min-w-0" onClick={(event) => event.stopPropagation()}>
      {button}
      {error ? <p className="text-xs font-medium text-rose-700">{error}</p> : null}
    </div>
  );
}
