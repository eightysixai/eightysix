import { NavLink, Outlet } from "react-router";
import { ViewHeader } from "../../components/layout/ViewHeader";
import { useOrganization } from "../../context/OrganizationContext";

const OWNER_ONLY_TABS = [
  { to: "/settings/team", label: "Team" },
  { to: "/settings/billing", label: "Billing" },
  { to: "/settings/organization", label: "Organization" },
  { to: "/settings/integrations", label: "Integrations" },
];

export function SettingsLayout() {
  const { role } = useOrganization();
  const isOwner = role === "owner";

  return (
    <>
      <ViewHeader title="Settings" subtitle="Account, team, and billing" />

      <div className="settings-tabs">
        <NavLink
          to="/settings/profile"
          className={({ isActive }) =>
            `settings-tab${isActive ? " active" : ""}`
          }
        >
          Profile
        </NavLink>
        {isOwner &&
          OWNER_ONLY_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              className={({ isActive }) =>
                `settings-tab${isActive ? " active" : ""}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
      </div>

      <Outlet />
    </>
  );
}
