// Stripe calls this directly (not through the app), so it's configured with
// verify_jwt = false in supabase/config.toml and instead verifies Stripe's
// own webhook signature. Requires STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET
// secrets. Keeps organizations.plan/billing_status/stripe_subscription_id in
// sync with the actual subscription state.
//
// Setup note: give each Stripe Price a `plan_code` metadata value
// ("starter" | "pro") when you create it in the Stripe Dashboard — that's
// how this function maps a subscription back to a plan, instead of hardcoding
// Stripe price ids here.
import Stripe from "npm:stripe@^17";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!stripeSecretKey || !webhookSecret) {
    return new Response("Webhook not configured", { status: 503 });
  }
  const stripe = new Stripe(stripeSecretKey);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      webhookSecret,
    );
  } catch (err) {
    return new Response(
      `Signature verification failed: ${err instanceof Error ? err.message : err}`,
      { status: 400 },
    );
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  async function planCodeForSubscription(subscription: Stripe.Subscription) {
    const price = subscription.items.data[0]?.price;
    const planCode = price?.metadata?.plan_code;
    if (planCode) return planCode;
    // Fall back to fetching the price if metadata wasn't expanded.
    if (price?.id) {
      const fullPrice = await stripe.prices.retrieve(price.id);
      return fullPrice.metadata?.plan_code ?? null;
    }
    return null;
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const organizationId = session.client_reference_id;
        if (organizationId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(
            session.subscription as string,
          );
          const planCode = await planCodeForSubscription(subscription);
          await admin
            .from("organizations")
            .update({
              plan: planCode ?? "starter",
              billing_status: "active",
              stripe_subscription_id: subscription.id,
              stripe_customer_id: session.customer as string,
            })
            .eq("id", organizationId);
        }
        break;
      }
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organization_id;
        if (organizationId) {
          const planCode = await planCodeForSubscription(subscription);
          const billingStatus =
            subscription.status === "active" || subscription.status === "trialing"
              ? "active"
              : subscription.status === "past_due"
                ? "past_due"
                : "inactive";
          await admin
            .from("organizations")
            .update({
              plan: planCode ?? undefined,
              billing_status: billingStatus,
              stripe_subscription_id: subscription.id,
            })
            .eq("id", organizationId);
        }
        break;
      }
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const organizationId = subscription.metadata?.organization_id;
        if (organizationId) {
          await admin
            .from("organizations")
            .update({ plan: "free", billing_status: "inactive" })
            .eq("id", organizationId);
        }
        break;
      }
    }
  } catch (err) {
    console.error("stripe-webhook handler error", err);
    return new Response("Handler error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
