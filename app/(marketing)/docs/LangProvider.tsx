"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { isLang, type Lang } from "./snippets";

/*
 * The snippet language is one global choice, shared by every endpoint on every
 * docs page and remembered between visits.
 *
 * State lives here, but VISIBILITY is CSS's job: the choice is written to
 * data-lang on <html> and globals.css shows the matching snippet. Each endpoint
 * renders all three, so switching updates the whole page at once, and the
 * pre-paint script in layout.tsx applies a remembered choice before React
 * loads — no flash of the wrong language, no hydration mismatch (the server
 * can't know the choice, and with CSS deciding, it doesn't need to).
 *
 * React state exists for the tabs' aria-pressed and for anything that needs to
 * read the language in JS; it deliberately does not drive the markup.
 */

const STORAGE_KEY = "docs-lang";

type LangContextValue = { lang: Lang; setLang: (lang: Lang) => void };

const LangContext = createContext<LangContextValue>({
  lang: "javascript",
  setLang: () => {},
});

export function useLang() {
  return useContext(LangContext);
}

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("javascript");

  // Adopt the remembered choice after mount. The inline script has usually set
  // the attribute already; this catches client-side navigations into /docs,
  // where that script never runs, and syncs React state either way.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Storage can be unavailable (private mode, blocked cookies) — the
      // default language is a fine outcome.
    }
    if (isLang(stored)) {
      setLangState(stored);
      document.documentElement.dataset.lang = stored;
    }
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    document.documentElement.dataset.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisting is survivable; the choice still applies to this visit.
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}
