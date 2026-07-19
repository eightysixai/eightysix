export interface PlanDefinition {
  code: "starter" | "pro" | "enterprise";
  name: string;
  price: number | null;
  /** Stripe Price id for subscription Checkout — set these to your real Stripe price ids before Billing works. */
  stripePriceId: string | null;
  maxLocations: number;
  maxMembers: number;
  integrations: boolean;
}

export const PLANS: PlanDefinition[] = [
  {
    code: "starter",
    name: "Starter",
    price: 29,
    stripePriceId: "price_REPLACE_WITH_STARTER_PRICE_ID",
    maxLocations: 1,
    maxMembers: 3,
    integrations: false,
  },
  {
    code: "pro",
    name: "Pro",
    price: 99,
    stripePriceId: "price_REPLACE_WITH_PRO_PRICE_ID",
    maxLocations: 5,
    maxMembers: 15,
    integrations: true,
  },
  {
    code: "enterprise",
    name: "Enterprise",
    price: null,
    stripePriceId: null,
    maxLocations: Infinity,
    maxMembers: Infinity,
    integrations: true,
  },
];

/** Orgs that haven't subscribed yet (organizations.plan defaults to 'free'). */
export const FREE_PLAN_LIMITS = {
  maxLocations: 1,
  maxMembers: 1,
  integrations: false,
};

export function getPlanLimits(planCode: string) {
  const plan = PLANS.find((p) => p.code === planCode);
  if (!plan) return FREE_PLAN_LIMITS;
  return {
    maxLocations: plan.maxLocations,
    maxMembers: plan.maxMembers,
    integrations: plan.integrations,
  };
}
