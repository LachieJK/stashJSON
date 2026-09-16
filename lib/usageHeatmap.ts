/**
 * The When heatmap's fold: hourly UTC counts → a 7 × 24 weekday × hour grid
 * in the viewer's zone. Pure and dependency-free like `lib/usageFilters.ts`:
 * the client-side heatmap imports this, so it must never pull in `lib/db`.
 *
 * The server cannot know the browser's zone (decision in #60), so the page
 * ships the UTC hours (`hourlyCounts` in `lib/usage.ts`) and the browser
 * folds them here with its own zone. The localiser is a parameter so the
 * fold is testable with a fixed offset.
 */

/** A `HourlyCount` as the page hands it to the client: `hourUtc` as epoch ms of the hour's start. */
export type HeatmapHour = { hourUtc: number; count: number };

/** Where an instant lands in the viewer's week: `weekday` 0 = Sunday, `hour` 0–23. */
export type Localiser = (ms: number) => { weekday: number; hour: number };

/** A zone at a fixed offset from UTC, in minutes (UTC+2 → 120). */
export function fixedOffset(minutes: number): Localiser {
  return (ms) => {
    const d = new Date(ms + minutes * 60_000);
    return { weekday: d.getUTCDay(), hour: d.getUTCHours() };
  };
}

/** The browser's own zone, DST included — what the page uses once mounted. */
export const browserLocal: Localiser = (ms) => {
  const d = new Date(ms);
  return { weekday: d.getDay(), hour: d.getHours() };
};

/** `grid[weekday][hour]` = requests, summed across every week in the range. */
export function foldHeatmap(rows: HeatmapHour[], local: Localiser): number[][] {
  const grid = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const r of rows) {
    const { weekday, hour } = local(r.hourUtc);
    grid[weekday][hour] += r.count;
  }
  return grid;
}
