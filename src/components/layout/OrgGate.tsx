import { Navigate, Outlet } from "react-router";
import { useOrganization } from "../../context/OrganizationContext";

export function OrgGate() {
  const { loading, organizationId, locationId } = useOrganization();

  if (loading) {
    return <div className="auth-shell">Loading…</div>;
  }

  if (!organizationId || !locationId) {
    return <Navigate to="/onboarding" replace />;
  }

  return <Outlet />;
}
