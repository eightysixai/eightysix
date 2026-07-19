// Starts an OAuth2 connection to an accounting or POS provider for an
// organization. Requires <PROVIDER>_CLIENT_ID / <PROVIDER>_CLIENT_SECRET
// secrets per provider (see _shared/integration-providers.ts) — until those
// are set, this clearly reports "not configured" rather than pretending to
// work. Actually importing data from a connected provider is a separate,
// provider-specific job not built here (this is the connection scaffold).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { findProvider } from "../_shared/integration-providers.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing Authorization header" }, 401);

    const { organizationId, locationId, provider: providerKey } = await req.json();
    if (!organizationId || !providerKey) {
      return json({ error: "organizationId and provider are required" }, 400);
    }
    const provider = findProvider(providerKey);
    if (!provider) return json({ error: `Unknown provider ${providerKey}` }, 400);

    const clientId = Deno.env.get(provider.clientIdEnv);
    if (!clientId) {
      return json(
        {
          error: `${provider.label} isn't configured yet (missing ${provider.clientIdEnv}). Add it as a Supabase secret to enable this connection.`,
        },
        503,
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
    const { data: membership } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", caller.id)
      .eq("status", "active")
      .maybeSingle();
    if (!membership || !["owner", "admin"].includes(membership.role)) {
      return json({ error: "Only an owner or admin can manage integrations" }, 403);
    }

    const state = crypto.randomUUID();
    const { error: upsertError } = await admin
      .from("integration_connections")
      .upsert(
        {
          organization_id: organizationId,
          location_id: locationId ?? null,
          provider: provider.key,
          integration_type: provider.integrationType,
          status: "connecting",
          config: { oauth_state: state },
        },
        { onConflict: "organization_id,location_id,provider,integration_type" },
      );
    if (upsertError) return json({ error: upsertError.message }, 500);

    const redirectUri = `${supabaseUrl}/functions/v1/integrations-oauth-callback`;
    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: provider.scope,
      state: `${organizationId}:${provider.key}:${state}`,
      ...provider.extraAuthorizeParams,
    });

    return json({ url: `${provider.authorizeUrl}?${params.toString()}` });
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
