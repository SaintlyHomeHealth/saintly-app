import type { ReactNode } from "react";

const KEYWORD_RE = /\b(Medicare|Insurance|Humana)\b/gi;

/** Bold key insurance terms inside free text (scan-friendly). */
export function highlightThreadKeywords(text: string): ReactNode {
  if (!text) return null;
  const parts: ReactNode[] = [];
  let last = 0;
  const re = new RegExp(KEYWORD_RE.source, KEYWORD_RE.flags);
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      parts.push(<span key={k++}>{text.slice(last, m.index)}</span>);
    }
    parts.push(
      <strong key={k++} className="font-semibold text-sky-950">
        {m[0]}
      </strong>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    parts.push(<span key={k++}>{text.slice(last)}</span>);
  }
  return <span className="whitespace-pre-wrap break-words">{parts}</span>;
}
