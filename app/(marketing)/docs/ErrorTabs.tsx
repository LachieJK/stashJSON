"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";

/*
 * The Errors section's status-code switch: pick a status, read what it means,
 * see what comes back.
 *
 * Visually the same tab strip as the snippet-language switch, but the state is
 * deliberately local — which error you're inspecting is a passing question, not
 * a preference worth remembering or sharing across the page. So this is plain
 * React state rather than the LangProvider's attribute-on-<html> machinery.
 *
 * Real tablist semantics, which means real keyboard support: roving tabindex,
 * arrows to move (activating as they go), Home/End to jump. Every panel stays
 * in the DOM so each tab's aria-controls always resolves.
 */

export type ApiErrorDoc = {
  status: number;
  // The status' plain-language name, used as the panel's bold lead-in.
  title: string;
  explanation: string;
  // The JSON body the API actually returns for this status.
  body: string;
};

export function ErrorTabs({ errors }: { errors: ApiErrorDoc[] }) {
  const [active, setActive] = useState(errors[0].status);
  const baseId = useId();
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const tabId = (status: number) => `${baseId}-tab-${status}`;
  const panelId = (status: number) => `${baseId}-panel-${status}`;

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const current = errors.findIndex((e) => e.status === active);
    const last = errors.length - 1;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
        next = current === last ? 0 : current + 1;
        break;
      case "ArrowLeft":
        next = current === 0 ? last : current - 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = last;
        break;
      default:
        return;
    }
    event.preventDefault();
    setActive(errors[next].status);
    tabRefs.current[next]?.focus();
  }

  return (
    <div className="mt-4">
      <div
        role="tablist"
        aria-label="Error responses by status code"
        className="tabs"
        onKeyDown={onKeyDown}
      >
        {errors.map((e, i) => (
          <button
            key={e.status}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            id={tabId(e.status)}
            type="button"
            role="tab"
            className="tab"
            // The visible "404" prefixes the fuller name, so voice control can
            // still act on what it says on the tin.
            aria-label={`${e.status} ${e.title}`}
            aria-selected={active === e.status}
            aria-controls={panelId(e.status)}
            tabIndex={active === e.status ? 0 : -1}
            onClick={() => setActive(e.status)}
          >
            {e.status}
          </button>
        ))}
      </div>

      {errors.map((e) => (
        <div
          key={e.status}
          id={panelId(e.status)}
          role="tabpanel"
          aria-labelledby={tabId(e.status)}
          hidden={active !== e.status}
          // Focusable so the codeblock inside is reachable by keyboard.
          tabIndex={0}
          className="mt-3"
        >
          <p className="max-w-prose text-sm text-muted">
            <strong className="font-semibold text-text">{e.title}.</strong>{" "}
            {e.explanation}
          </p>
          <pre className="codeblock mt-3">
            <code>{e.body}</code>
          </pre>
        </div>
      ))}
    </div>
  );
}
