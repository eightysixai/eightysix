// Opens a Stripe Billing Portal session so the org owner can update payment
// methods, view invoices, or cancel — without us building any of that UI.
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

    const { organizationId, returnUrl } = await req.json();
    if (!organizationId || !returnUrl) {
      return json({ error: "organizationId and returnUrl are required" }, 400);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
    } = await callerClient.auth.getUser();
    if (!caller) return json({ error: "Not authenticated" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
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

    const { data: org } = await admin
      .from("organizations")
      .select("stripe_customer_id")
      .eq("id", organizationId)
      .single();
    if (!org?.stripe_customer_id) {
      return json({ error: "No billing account yet — subscribe first" }, 400);
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: org.stripe_customer_id,
      return_url: returnUrl,
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
