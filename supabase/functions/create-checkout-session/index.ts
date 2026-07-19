// Starts a Stripe Checkout session for an organization to subscribe to a
// paid plan. Requires STRIPE_SECRET_KEY as a Supabase secret. The org owner
// calls this from Settings > Billing; Stripe redirects the browser back to
// the app afterward, and the actual plan/billing_status update happens in
// stripe-webhook once Stripe confirms the subscription.
import Stripe from "npm:stripe@^17";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      return json(
        { error: "Billing isn't configured yet (missing STRIPE_SECRET_KEY)" },
        503,
      );
    }
    const stripe = new Stripe(stripeSecretKey);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { organizationId, priceId, successUrl, cancelUrl } = await req.json();
    if (!organizationId || !priceId || !successUrl || !cancelUrl) {
      return json(
        { error: "organizationId, priceId, successUrl, cancelUrl are required" },
        400,
      );
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: org, error: orgError } = await admin
      .from("organizations")
      .select("id, name, stripe_customer_id, created_by")
      .eq("id", organizationId)
      .single();
    if (orgError || !org) return json({ error: "Organization not found" }, 404);

    const { data: membership } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", caller.id)
      .eq("status", "active")
      .maybeSingle();
    if (membership?.role !== "owner") {
      return json({ error: "Only the organization owner can manage billing" }, 403);
    }

    let customerId = org.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        name: org.name,
        email: caller.email ?? undefined,
        metadata: { organization_id: organizationId },
      });
      customerId = customer.id;
      await admin
        .from("organizations")
        .update({ stripe_customer_id: customerId })
        .eq("id", organizationId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: organizationId,
      subscription_data: { metadata: { organization_id: organizationId } },
    });

    return json({ url: session.url });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : "Unexpected error" },
      500,
    );
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
