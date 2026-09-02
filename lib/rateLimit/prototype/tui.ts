/**
 * PROTOTYPE — issue #43. Throwaway.
 *
 * A terminal shell over `consume()` so the bucket can be driven by hand: spend
 * tokens, jump the clock forward, change the policy underneath a live bucket,
 * and watch the balance and the headers move. The interesting moments are the
 * ones where the numbers do something you did not expect.
 *
 * The TUI passes an explicit `at` — the app clock plus a virtual offset — so
 * that time travel is possible without waiting. Production never does this: it
 * lets the statement use Postgres's `now()` (#36). The hammer exercises that
 * real-clock path.
 *
 * Run: npm run proto:ratelimit
 */

import { createConsumer, type BucketPolicy, type Decision } from "./consume";
import { PROTO_DATABASE_URL as DATABASE_URL } from "./setup";

const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;

const KEYS = ["user:alice:api", "user:alice:dashboard", "user:bob:api"];

const c = createConsumer({ connectionString: DATABASE_URL, connections: 4 });

const state = {
  keyIndex: 0,
  policy: { capacity: 10, refillPerSecond: 2 } as BucketPolicy,
  offsetMs: 0,
  last: undefined as Decision | undefined,
  ledger: [] as boolean[],
  allowed: 0,
  rejected: 0,
  note: "",
};

const key = () => KEYS[state.keyIndex];
const clock = () => new Date(Date.now() + state.offsetMs);

async function bucketRow() {
  const rows = await c.prisma.$queryRawUnsafe<
    { tokens: number; updated_at: Date }[]
  >(`SELECT tokens, updated_at FROM proto_rate_limit_bucket WHERE key = $1`, key());
  return rows[0];
}

function render(row?: { tokens: number; updated_at: Date }) {
  console.clear();
  const p = state.policy;
  const d = state.last;

  console.log(bold("\n  StashJSON per-account rate limiter") + dim("  — PROTOTYPE, issue #43\n"));

  console.log(`  ${bold("Key")}        ${key()}`);
  console.log(
    `  ${bold("Policy")}     capacity ${p.capacity}, refill ${p.refillPerSecond}/s ` +
      dim(`(sustained ${p.refillPerSecond * 60}/min)`),
  );
  console.log(
    `  ${bold("Clock")}      +${(state.offsetMs / 1000).toFixed(1)}s virtual  ` +
      dim(clock().toISOString()),
  );

  console.log(bold("\n  Bucket"));
  if (row) {
    console.log(`    tokens      ${row.tokens.toFixed(4)}`);
    console.log(`    updated_at  ${dim(new Date(row.updated_at).toISOString())}`);
  } else {
    console.log(dim("    (no row yet — the first consume inserts it)"));
  }

  console.log(bold("\n  Last decision"));
  if (d) {
    console.log(`    ${d.allowed ? green("ALLOWED") : red("REJECTED (429)")}`);
    console.log(`    remaining    ${d.remaining}  ${dim(`of ${d.limit}`)}`);
    console.log(`    Retry-After  ${d.retryAfterSeconds}s`);
    console.log(`    resetAt      ${dim(d.resetAt.toISOString())}`);
  } else {
    console.log(dim("    (nothing consumed yet)"));
  }

  const marks = state.ledger
    .slice(-48)
    .map((ok) => (ok ? green("|") : red("x")))
    .join("");
  console.log(bold("\n  Ledger  ") + marks);
  console.log(dim(`    allowed ${state.allowed}   rejected ${state.rejected}`));

  if (state.note) console.log(`\n  ${dim(state.note)}`);

  console.log(
    dim("\n  ────────────────────────────────────────────────────────────────\n") +
      `  ${bold("[space]")} consume   ${bold("[b]")} burst x10   ${bold("[x]")} delete bucket   ${bold("[k]")} cycle key\n` +
      `  ${bold("[t]")} +1s clock  ${bold("[T]")} +10s clock  ${bold("[0]")} reset clock  ${bold("[w]")} wait 1s real\n` +
      `  ${bold("[c/C]")} capacity -/+   ${bold("[r/R]")} refill -/+   ${bold("[q]")} quit\n`,
  );
}

async function record(d: Decision) {
  state.last = d;
  state.ledger.push(d.allowed);
  if (d.allowed) state.allowed++;
  else state.rejected++;
}

async function draw() {
  render(await bucketRow());
}

async function handle(ch: string) {
  state.note = "";
  switch (ch) {
    case " ":
      await record(await c.consume(key(), state.policy, clock()));
      break;
    case "b":
      for (let i = 0; i < 10; i++) {
        await record(await c.consume(key(), state.policy, clock()));
      }
      state.note = "Burst of 10 at one instant — capacity is the only thing that caps this.";
      break;
    case "x":
      await c.prisma.$executeRawUnsafe(
        `DELETE FROM proto_rate_limit_bucket WHERE key = $1`,
        key(),
      );
      state.last = undefined;
      state.note = "Row deleted. The next consume re-inserts it at full capacity.";
      break;
    case "k":
      state.keyIndex = (state.keyIndex + 1) % KEYS.length;
      state.note = "Each key is an independent bucket — note the :api / :dashboard split (#37).";
      break;
    case "t":
      state.offsetMs += 1000;
      break;
    case "T":
      state.offsetMs += 10_000;
      break;
    case "0":
      state.offsetMs = 0;
      state.note = "Virtual clock back to real time.";
      break;
    case "w":
      await new Promise((r) => setTimeout(r, 1000));
      break;
    case "c":
      state.policy = { ...state.policy, capacity: Math.max(1, state.policy.capacity - 1) };
      break;
    case "C":
      state.policy = { ...state.policy, capacity: state.policy.capacity + 1 };
      break;
    case "r":
      state.policy = {
        ...state.policy,
        refillPerSecond: Math.max(0, state.policy.refillPerSecond - 1),
      };
      break;
    case "R":
      state.policy = { ...state.policy, refillPerSecond: state.policy.refillPerSecond + 1 };
      break;
  }
}

async function main() {
  process.stdin.setRawMode?.(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");

  await draw();

  // Raw mode delivers one keystroke per chunk, but a paste (or a piped smoke
  // test) arrives as several at once — so walk the chunk rather than treating
  // it as a single key.
  process.stdin.on("data", async (buf: string) => {
    for (const ch of buf.toString()) {
      if (ch === "q" || ch === "\u0003") {
        await c.close();
        console.clear();
        process.exit(0);
      }
      try {
        await handle(ch);
      } catch (e) {
        state.note = `error: ${(e as Error).message}`;
      }
    }
    await draw();
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
