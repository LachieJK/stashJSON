"use client";

import { useLang } from "./LangProvider";
import { LANGS, type Lang } from "./snippets";

/*
 * The Request subsection: a language switch and all three snippets, of which
 * CSS reveals one (see .snippet in globals.css). Picking a language here
 * switches every endpoint on the page — the tabs write to shared state, not
 * local state, because reading docs in two languages at once is never the goal.
 */
export function RequestSnippet({
  snippets,
  endpointTitle,
}: {
  snippets: Record<Lang, string>;
  endpointTitle: string;
}) {
  const { lang, setLang } = useLang();

  return (
    <div className="mt-5">
      <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <h3 className="eyebrow">Request</h3>
        <div
          role="group"
          aria-label={`Snippet language for ${endpointTitle}`}
          className="tabs"
        >
          {LANGS.map((l) => (
            <button
              key={l.id}
              type="button"
              data-lang={l.id}
              className="tab"
              aria-pressed={lang === l.id}
              onClick={() => setLang(l.id)}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>

      {LANGS.map((l) => (
        <pre key={l.id} data-lang={l.id} className="snippet codeblock">
          <code>{snippets[l.id]}</code>
        </pre>
      ))}
    </div>
  );
}
