import { NavLink, useNavigate } from "react-router";
import { useAuth } from "../../context/AuthContext";
import { useOrganization } from "../../context/OrganizationContext";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard" },
  { to: "/invoices", label: "Invoices" },
  { to: "/recipes", label: "Recipes" },
  { to: "/sales", label: "Sales" },
  { to: "/menu-analysis", label: "Menu Analysis" },
  { to: "/theoreticals", label: "Theoreticals vs. Actuals" },
  { to: "/labor", label: "Labor" },
  { to: "/price-history", label: "Price History" },
  { to: "/reports", label: "Reports" },
];

export function Sidebar() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  const {
    organizationName,
    locationName,
    memberships,
    locations,
    organizationId,
    locationId,
    switchOrganization,
    switchLocation,
  } = useOrganization();

  const handleSignOut = async () => {
    await signOut();
    navigate("/sign-in", { replace: true });
  };

  return (
    <nav className="sidebar">
      <div className="sidebar-brand">
        <span className="brand-mark" />
        {memberships.length > 1 ? (
          <select
            className="sidebar-select"
            value={organizationId ?? ""}
            onChange={(e) => switchOrganization(e.target.value)}
          >
            {memberships.map((m) => (
              <option key={m.organizationId} value={m.organizationId}>
                {m.organizationName}
              </option>
            ))}
          </select>
        ) : (
          <span>{organizationName ?? "Restaurant Management"}</span>
        )}
      </div>

      {locations.length > 1 ? (
        <select
          className="sidebar-select sidebar-select-sm"
          value={locationId ?? ""}
          onChange={(e) => switchLocation(e.target.value)}
        >
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="live-indicator">
          <span className="live-dot" />
          <span>{locationName ?? "Live"}</span>
        </div>
      )}

      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          {item.label}
        </NavLink>
      ))}

      <div className="sidebar-footer">
        <NavLink
          to="/settings"
          className={({ isActive }) => `nav-link${isActive ? " active" : ""}`}
        >
          Settings
        </NavLink>
        <button className="nav-link" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </nav>
  );
}
