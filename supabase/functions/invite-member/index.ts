// Invites a user (new or existing) into an organization with a given role.
// Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY secrets (the service
// role key is never sent to the browser — only this server-side function
// holds it) to call the Auth admin API and bypass RLS for the membership
// insert. The caller's own JWT is used to verify they're actually an
// owner/admin of the organization before anything happens.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const ROLES = ["admin", "manager", "accountant", "staff", "viewer"] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const { organizationId, email, role } = await req.json();
    if (!organizationId || !email || !role) {
      return json(
        { error: "organizationId, email, and role are required" },
        400,
      );
    }
    if (!ROLES.includes(role)) {
      return json({ error: `role must be one of: ${ROLES.join(", ")}` }, 400);
    }

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user: caller },
      error: callerError,
    } = await callerClient.auth.getUser();
    if (callerError || !caller) {
      return json({ error: "Not authenticated" }, 401);
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: callerMembership } = await admin
      .from("organization_members")
      .select("role")
      .eq("organization_id", organizationId)
      .eq("user_id", caller.id)
      .eq("status", "active")
      .maybeSingle();

    if (
      !callerMembership ||
      !["owner", "admin"].includes(callerMembership.role)
    ) {
      return json(
        { error: "Only an owner or admin can invite members" },
        403,
      );
    }

    let invitedUserId: string;
    const { data: inviteData, error: inviteError } =
      await admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: Deno.env.get("SITE_URL")
          ? `${Deno.env.get("SITE_URL")}/reset-password`
          : undefined,
      });

    if (inviteError) {
      const alreadyExists =
        inviteError.message?.toLowerCase().includes("already been registered") ||
        inviteError.message?.toLowerCase().includes("already registered");
      if (!alreadyExists) {
        return json({ error: inviteError.message }, 400);
      }

      // User already has an account — find them instead of creating a new one.
      let found: { id: string } | null = null;
      let page = 1;
      while (!found) {
        const { data: pageData, error: listError } =
          await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (listError) return json({ error: listError.message }, 500);
        found =
          pageData.users.find(
            (u) => u.email?.toLowerCase() === email.toLowerCase(),
          ) ?? null;
        if (pageData.users.length < 200) break;
        page += 1;
      }
      if (!found) {
        return json(
          { error: "Could not find or create a user for that email" },
          500,
        );
      }
      invitedUserId = found.id;
    } else {
      invitedUserId = inviteData.user.id;
    }

    const { error: membershipError } = await admin
      .from("organization_members")
      .upsert(
        {
          organization_id: organizationId,
          user_id: invitedUserId,
          role,
          status: "invited",
          invited_by: caller.id,
          invited_email: email,
        },
        { onConflict: "organization_id,user_id" },
      );

    if (membershipError) {
      return json({ error: membershipError.message }, 500);
    }

    return json({ success: true });
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
