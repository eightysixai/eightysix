// Receives the provider's OAuth2 redirect, exchanges the code for tokens,
// and marks the connection active. This is the connection scaffold only —
// actually importing invoices/sales from a connected provider is
// provider-specific work not built here.
//
// Scaffold note: tokens are stored in integration_connections.config for now.
// Before going to production, move them into Supabase Vault (a
// `vault.create_secret` wrapper RPC) and store only the secret name in
// `secret_reference`, per the column's original design intent.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { findProvider } from "../_shared/integration-providers.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const siteUrl = Deno.env.get("SITE_URL") ?? "";
  const redirectBack = (status: string, message?: string) => {
    const target = new URL(`${siteUrl}/settings/integrations`);
    target.searchParams.set("connection", status);
    if (message) target.searchParams.set("message", message);
    return Response.redirect(target.toString(), 302);
  };

  if (oauthError) return redirectBack("error", oauthError);
  if (!code || !state) return redirectBack("error", "Missing code or state");

  const [organizationId, providerKey, expectedState] = state.split(":");
  const provider = findProvider(providerKey);
  if (!organizationId || !provider) {
    return redirectBack("error", "Invalid state");
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: connection } = await admin
    .from("integration_connections")
    .select("id, config")
    .eq("organization_id", organizationId)
    .eq("provider", provider.key)
    .eq("integration_type", provider.integrationType)
    .maybeSingle();

  const storedState = (connection?.config as Record<string, unknown>)
    ?.oauth_state;
  if (!connection || storedState !== expectedState) {
    return redirectBack("error", "State mismatch — please try connecting again");
  }

  const clientId = Deno.env.get(provider.clientIdEnv);
  const clientSecret = Deno.env.get(provider.clientSecretEnv);
  if (!clientId || !clientSecret) {
    return redirectBack("error", `${provider.label} is not fully configured`);
  }

  try {
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/integrations-oauth-callback`;
    const tokenResponse = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const detail = await tokenResponse.text();
      await admin
        .from("integration_connections")
        .update({ status: "error", last_error: detail.slice(0, 500) })
        .eq("id", connection.id);
      return redirectBack("error", "Token exchange failed");
    }

    const tokens = await tokenResponse.json();
    await admin
      .from("integration_connections")
      .update({
        status: "active",
        last_synced_at: null,
        last_error: null,
        config: { connected_at: new Date().toISOString(), tokens },
      })
      .eq("id", connection.id);

    return redirectBack("success");
  } catch (err) {
    await admin
      .from("integration_connections")
      .update({
        status: "error",
        last_error: err instanceof Error ? err.message : "Unknown error",
      })
      .eq("id", connection.id);
    return redirectBack("error", "Unexpected error during connection");
  }
});
