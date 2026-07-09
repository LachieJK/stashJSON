// Static plan catalog for the marketing pricing page.
//
// This is intentionally inert: no Stripe imports, no env access, no network.
// It's a plain typed catalog the pricing page maps over.

export type PlanTierId = "free" | "pro" | "team";

export type Plan = {
  id: PlanTierId;
  name: string;
  /** Whole US dollars per month. 0 means free. */
  priceMonthly: number;
  tagline: string;
  features: string[];
  /** Visually highlight this plan as the recommended one. */
  featured?: boolean;
  ctaLabel: string;

  // ── BILLING STAGE SEAM (next stage plugs in HERE) ─────────────────────────
  // When Stripe is wired up, populate this with the Stripe Price ID for the
  // plan's recurring subscription (e.g. "price_1QabcXYZ..."). It's left
  // `undefined` for now so nothing imports Stripe or reads env at this stage.
  //
  // Consumers to be built next:
  //   • POST /api/billing/checkout — looks up PLANS by `id`, reads
  //     `stripePriceId`, and creates a Stripe Checkout Session for it.
  //   • The Stripe webhook handler — maps a completed session's price back to
  //     a `PlanTierId` to provision/downgrade the user's account.
  // Keep this field the single source of truth for that mapping.
  stripePriceId?: string;
};

export const PLANS: Plan[] = [
  {
    id: "free",
    name: "Free",
    priceMonthly: 0,
    tagline: "Everything you need to start storing JSON.",
    ctaLabel: "Start for free",
    features: [
      "1 workspace",
      "1,000 documents",
      "60 API requests / minute",
      "7 days of version history",
      "1 API key",
      "Community support",
    ],
    // stripePriceId: undefined — free tier needs no Stripe price.
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 19,
    tagline: "For developers shipping real projects.",
    featured: true,
    ctaLabel: "Upgrade to Pro",
    features: [
      "10 workspaces",
      "100,000 documents",
      "600 API requests / minute",
      "90 days of version history",
      "10 API keys",
      "Email support",
    ],
    // stripePriceId: undefined — set to the Pro monthly Stripe Price ID.
  },
  {
    id: "team",
    name: "Team",
    priceMonthly: 99,
    tagline: "For teams that need scale and control.",
    ctaLabel: "Choose Team",
    features: [
      "Unlimited workspaces",
      "Unlimited documents",
      "6,000 API requests / minute",
      "1 year of version history",
      "Unlimited API keys",
      "Priority support & SLA",
    ],
    // stripePriceId: undefined — set to the Team monthly Stripe Price ID.
  },
];
