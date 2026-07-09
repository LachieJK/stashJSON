"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

// The dashboard authenticates with the same X-API-Key the public API uses.
// We keep the key in localStorage so it survives reloads.
const STORAGE_KEY = "stashjson_api_key";

type ApiKeyContextValue = {
  apiKey: string | null;
  ready: boolean;
  setApiKey: (key: string | null) => void;
};

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null);

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [apiKey, setKey] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setKey(localStorage.getItem(STORAGE_KEY));
    setReady(true);
  }, []);

  const setApiKey = useCallback((key: string | null) => {
    setKey(key);
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  }, []);

  return (
    <ApiKeyContext.Provider value={{ apiKey, ready, setApiKey }}>
      {children}
    </ApiKeyContext.Provider>
  );
}

export function useApiKey() {
  const ctx = useContext(ApiKeyContext);
  if (!ctx) throw new Error("useApiKey must be used within ApiKeyProvider");
  return ctx;
}
