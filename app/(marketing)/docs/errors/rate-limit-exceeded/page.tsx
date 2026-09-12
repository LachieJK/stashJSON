import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rate limit exceeded · StashJSON docs",
};

// The target of the `type` URI in every 429 body
// (https://stashjson.com/docs/errors/rate-limit-exceeded). Shipping it is the
// point: a `type` that pointed at nothing would be the dangling-URI mistake the
// wire contract explicitly rejected.
export default function RateLimitExceededPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Rate limit exceeded</h1>
      <p className="mt-3 max-w-prose text-muted">
        Every API key is metered against your plan&apos;s rate. When you exceed
        it the API answers <code className="font-mono">429 Too Many Requests</code>{" "}
        with this body:
      </p>
      <pre className="codeblock mt-3">
        <code>{`{
  "detail": "API rate limit exceeded",
  "type": "https://stashjson.com/docs/errors/rate-limit-exceeded"
}`}</code>
      </pre>

      <h2 className="mt-10 text-lg font-semibold">Headers</h2>
      <p className="mt-3 max-w-prose text-muted">
        Every response — not only a <code className="font-mono">429</code> —
        carries the current state of your bucket:
      </p>
      <ul className="mt-4 flex flex-col gap-2 text-sm text-muted">
        <li>
          <code className="font-mono">X-RateLimit-Limit</code> — the burst
          capacity of your bucket.
        </li>
        <li>
          <code className="font-mono">X-RateLimit-Remaining</code> — whole
          requests left right now.
        </li>
        <li>
          <code className="font-mono">X-RateLimit-Reset</code> — epoch seconds at
          which the bucket is full again.
        </li>
        <li>
          <code className="font-mono">Retry-After</code> — on a{" "}
          <code className="font-mono">429</code> only, the whole seconds to wait
          before retrying.
        </li>
      </ul>
      <p className="mt-3 max-w-prose text-muted">
        The limit is a single token bucket shared across all of your API keys: it
        refills continuously at your plan&apos;s sustained rate, and a rejected
        request spends nothing, so you recover at exactly that rate.
      </p>

      <h2 className="mt-10 text-lg font-semibold">A note on accuracy</h2>
      <p className="mt-3 max-w-prose text-muted">
        On a rejected request the <code className="font-mono">X-RateLimit-*</code>{" "}
        values are advisory and may be marginally stale under concurrency, while
        the allow/deny decision itself is always live. Treat{" "}
        <code className="font-mono">Retry-After</code> as the reliable signal for
        when to try again.
      </p>
    </div>
  );
}
