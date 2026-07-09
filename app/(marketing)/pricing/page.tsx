import Link from "next/link";
import { PLANS } from "@/lib/plans";

// Pricing page. Static content mapped from the plan catalog in lib/plans.ts.
export default function PricingPage() {
  return (
    <div className="mx-auto max-w-5xl px-6 py-16">
      <section className="text-center">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Simple, predictable pricing
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-lg text-muted">
          Start free and upgrade when you need more workspaces, throughput, and
          history. No surprises.
        </p>
      </section>

      <section className="mt-12 grid gap-4 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`card flex flex-col ${
              plan.featured ? "border-accent" : ""
            }`}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{plan.name}</h2>
              {plan.featured ? (
                <span className="pill border-accent text-accent">
                  Most popular
                </span>
              ) : null}
            </div>

            <div className="mt-4 flex items-baseline gap-1">
              {plan.priceMonthly === 0 ? (
                <span className="text-3xl font-bold">Free</span>
              ) : (
                <>
                  <span className="text-3xl font-bold">
                    ${plan.priceMonthly}
                  </span>
                  <span className="text-sm text-muted">/mo</span>
                </>
              )}
            </div>

            <p className="mt-3 text-sm text-muted">{plan.tagline}</p>

            <ul className="mt-5 mb-6 flex flex-col gap-2 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2">
                  <span aria-hidden className="mt-0.5 text-ok">
                    ✓
                  </span>
                  <span>{feature}</span>
                </li>
              ))}
            </ul>

            <Link
              href={`/signup?plan=${plan.id}`}
              className={`mt-auto ${plan.featured ? "btn" : "btn btn-secondary"}`}
            >
              {plan.ctaLabel}
            </Link>
          </div>
        ))}
      </section>
    </div>
  );
}
