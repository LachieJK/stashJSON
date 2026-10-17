/**
 * The opt-in gate for DB-backed suites.
 *
 * SAFETY: they are OFF by default and only run when TEST_DATABASE_URL names a
 * throwaway Postgres that is NOT a production/Neon host. The `.env`
 * DATABASE_URL (live Neon data) is never touched.
 *
 * When enabled, DATABASE_URL is pointed at the test database, so call this at
 * the top of a suite *before* any lib/route module (which imports lib/db →
 * lib/env) is loaded, and import those modules lazily inside the tests so that,
 * when disabled, nothing ever connects to a database.
 */

// `neon.tech` covers every Neon host, including the one in this repo's .env.
const PROD_MARKERS = ["neon.tech"];

export function enableTestDatabase(suite: string): boolean {
  const testDbUrl = process.env.TEST_DATABASE_URL;
  const looksProd =
    !!testDbUrl && PROD_MARKERS.some((m) => testDbUrl.includes(m));

  if (!testDbUrl || looksProd) {
    const why = looksProd
      ? "TEST_DATABASE_URL points at a production/Neon host — refusing to run."
      : "TEST_DATABASE_URL is not set.";
    // eslint-disable-next-line no-console
    console.info(
      `[integration] Skipping ${suite}: ${why} ` +
        "Set TEST_DATABASE_URL to a throwaway (non-Neon) Postgres to enable them.",
    );
    return false;
  }

  process.env.DATABASE_URL = testDbUrl;
  return true;
}
