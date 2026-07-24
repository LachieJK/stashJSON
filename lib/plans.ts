// Static, intentionally inert plan catalog for the pricing page — no Stripe, env, or network.

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

  /** Stripe Price ID for the plan's recurring subscription; unset until billing is wired. */
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
  },
];
