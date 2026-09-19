import type { LogPage } from "@/lib/usage";

/**
 * A page of log entries as the client holds it: epoch ms rather than a Date,
 * like the charts' buckets. Shared by the page's first render and the "Load
 * more" action, so both hand the Log component the same shape.
 */

export type ClientLogEntry = {
  id: string;
  at: number;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  /** Already rendered by `lib/usage.ts`: `You · prod-api`, `acct-7f3a`, `Anonymous`. */
  who: string;
};

export type ClientLogPage = {
  entries: ClientLogEntry[];
  nextCursor: string | null;
};

export function toClientPage(page: LogPage): ClientLogPage {
  return {
    entries: page.entries.map((e) => ({ ...e, at: e.at.getTime() })),
    nextCursor: page.nextCursor,
  };
}
