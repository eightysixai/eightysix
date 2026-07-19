import { Navigate, Outlet } from "react-router";
import { useOrganization } from "../../context/OrganizationContext";

/** Gates a route to the organization owner — used for billing, team invites, and org-level settings. */
export function OwnerRoute() {
  const { loading, role } = useOrganization();

  if (loading) {
    return <div className="auth-shell">Loading…</div>;
  }

  if (role !== "owner") {
    return <Navigate to="/settings/profile" replace />;
  }

  return <Outlet />;
}
