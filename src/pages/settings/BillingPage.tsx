import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useOrganization } from "../../context/OrganizationContext";
import { PLANS } from "../../lib/billing-plans";
import { supabase } from "../../lib/supabase";

interface OrgBilling {
  plan: string;
  billing_status: string;
  stripe_customer_id: string | null;
}

export function BillingPage() {
  const { organizationId } = useOrganization();
  const [org, setOrg] = useState<OrgBilling | null>(null);
  const [busyPlan, setBusyPlan] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  async function loadOrg() {
    if (!organizationId) return;
    const { data } = await supabase
      .from("organizations")
      .select("plan, billing_status, stripe_customer_id")
      .eq("id", organizationId)
      .single();
    setOrg(data);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial/refetch load of billing info, not a derivation of other state
    loadOrg();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const checkoutResult = searchParams.get("checkout");

  async function handleSubscribe(priceId: string, planCode: string) {
    if (!organizationId) return;
    setBusyPlan(planCode);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke(
      "create-checkout-session",
      {
        body: {
          organizationId,
          priceId,
          successUrl: `${window.location.origin}/settings/billing?checkout=success`,
          cancelUrl: `${window.location.origin}/settings/billing?checkout=cancelled`,
        },
      },
    );
    setBusyPlan(null);
    if (fnError || data?.error) {
      setError(fnError?.message ?? data?.error ?? "Failed to start checkout");
      return;
    }
    // eslint-disable-next-line react-hooks/immutability -- intentional cross-origin redirect to Stripe, not a React-managed value
    window.location.href = data.url;
  }

  async function handleManageBilling() {
    if (!organizationId) return;
    setBusyPlan("portal");
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke(
      "create-portal-session",
      {
        body: {
          organizationId,
          returnUrl: `${window.location.origin}/settings/billing`,
        },
      },
    );
    setBusyPlan(null);
    if (fnError || data?.error) {
      setError(fnError?.message ?? data?.error ?? "Failed to open billing portal");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <>
      {checkoutResult === "success" && (
        <p style={{ color: "var(--under)", fontSize: 13, marginBottom: 16 }}>
          Subscription updated — it may take a few seconds to reflect below.
        </p>
      )}
      {checkoutResult === "cancelled" && (
        <p className="subtitle" style={{ marginBottom: 16 }}>
          Checkout was cancelled.
        </p>
      )}
      {error && <p className="form-error">{error}</p>}

      <section className="panel">
        <div className="panel-header">
          <h2>Current Plan</h2>
          {org?.stripe_customer_id && (
            <button
              className="btn btn-secondary"
              onClick={handleManageBilling}
              disabled={busyPlan === "portal"}
            >
              {busyPlan === "portal" ? "Opening…" : "Manage Billing"}
            </button>
          )}
        </div>
        <div className="recipe-row">
          <span>Plan</span>
          <strong>{org?.plan ? capitalize(org.plan) : "Free"}</strong>
        </div>
        <div className="recipe-row">
          <span>Status</span>
          <strong>{org?.billing_status ?? "inactive"}</strong>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Plans</h2>
        </div>
        <div className="recipes-grid">
          {PLANS.map((plan) => {
            const isCurrent = org?.plan === plan.code;
            return (
              <div className="recipe-card" key={plan.code}>
                <h3>{plan.name}</h3>
                <div className="recipe-row">
                  <span>Price</span>
                  <strong>
                    {plan.price !== null ? `$${plan.price}/mo` : "Custom"}
                  </strong>
                </div>
                <div className="recipe-row">
                  <span>Locations</span>
                  <strong>
                    {Number.isFinite(plan.maxLocations)
                      ? plan.maxLocations
                      : "Unlimited"}
                  </strong>
                </div>
                <div className="recipe-row">
                  <span>Team Members</span>
                  <strong>
                    {Number.isFinite(plan.maxMembers)
                      ? plan.maxMembers
                      : "Unlimited"}
                  </strong>
                </div>
                <div className="recipe-row">
                  <span>Integrations</span>
                  <strong>{plan.integrations ? "Included" : "—"}</strong>
                </div>
                <div className="recipe-card-actions">
                  {isCurrent ? (
                    <button className="btn btn-secondary" disabled>
                      Current Plan
                    </button>
                  ) : plan.stripePriceId ? (
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        handleSubscribe(plan.stripePriceId!, plan.code)
                      }
                      disabled={busyPlan === plan.code}
                    >
                      {busyPlan === plan.code ? "Redirecting…" : "Subscribe"}
                    </button>
                  ) : (
                    <a
                      className="btn btn-secondary"
                      href="mailto:sales@example.com?subject=Enterprise%20plan"
                    >
                      Contact Us
                    </a>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="panel-caption">
          Starter/Pro checkout requires real Stripe price ids in{" "}
          <code>src/lib/billing-plans.ts</code> and the STRIPE_SECRET_KEY /
          STRIPE_WEBHOOK_SECRET secrets set on the linked Supabase project.
        </p>
      </section>
    </>
  );
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
