import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "./AuthContext";

export interface OrgMembership {
  organizationId: string;
  organizationName: string;
  role: string;
  status: string;
}

export interface LocationOption {
  id: string;
  name: string;
}

interface OrganizationContextValue {
  loading: boolean;
  memberships: OrgMembership[];
  pendingInvites: OrgMembership[];
  organizationId: string | null;
  organizationName: string | null;
  locations: LocationOption[];
  locationId: string | null;
  locationName: string | null;
  role: string | null;
  error: string | null;
  switchOrganization: (organizationId: string) => void;
  switchLocation: (locationId: string) => void;
  createOrganization: (
    organizationName: string,
    locationName?: string,
  ) => Promise<{ error: string | null }>;
  acceptInvite: (organizationId: string) => Promise<{ error: string | null }>;
  declineInvite: (organizationId: string) => Promise<{ error: string | null }>;
  refresh: () => Promise<void>;
}

const OrganizationContext = createContext<OrganizationContextValue | null>(
  null,
);

function storageKey(userId: string, suffix: string) {
  return `eightysix.${suffix}.${userId}`;
}

export function OrganizationProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<OrgMembership[]>([]);
  const [pendingInvites, setPendingInvites] = useState<OrgMembership[]>([]);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [locationId, setLocationId] = useState<string | null>(null);

  const loadMemberships = useCallback(async () => {
    if (!user) {
      setMemberships([]);
      setPendingInvites([]);
      setOrganizationId(null);
      setLocations([]);
      setLocationId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    const { data, error: membershipError } = await supabase
      .from("organization_members")
      .select("role, status, organization:organizations(id, name)")
      .eq("user_id", user.id)
      .in("status", ["active", "invited"]);

    if (membershipError) {
      setError(membershipError.message);
      setLoading(false);
      return;
    }

    const rows = (data ?? [])
      .filter((row) => row.organization)
      .map((row) => ({
        organizationId: row.organization!.id,
        organizationName: row.organization!.name,
        role: row.role,
        status: row.status,
      }));

    const active = rows.filter((r) => r.status === "active");
    const invited = rows.filter((r) => r.status === "invited");
    setMemberships(active);
    setPendingInvites(invited);

    const storedOrgId = user
      ? localStorage.getItem(storageKey(user.id, "currentOrg"))
      : null;
    const nextOrgId =
      (storedOrgId && active.some((m) => m.organizationId === storedOrgId)
        ? storedOrgId
        : active[0]?.organizationId) ?? null;
    setOrganizationId(nextOrgId);

    if (!nextOrgId) {
      setLocations([]);
      setLocationId(null);
      setLoading(false);
    }
    // location loading continues in the effect below, keyed on organizationId
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial/refetch load of org membership, not a derivation of other state
    loadMemberships();
  }, [loadMemberships]);

  useEffect(() => {
    if (!organizationId || !user) return;

    (async () => {
      setLoading(true);
      const { data, error: locationError } = await supabase
        .from("locations")
        .select("id, name")
        .eq("organization_id", organizationId)
        .eq("active", true)
        .order("created_at", { ascending: true });

      if (locationError) {
        setError(locationError.message);
        setLoading(false);
        return;
      }

      const options = data ?? [];
      setLocations(options);

      const storedLocationId = localStorage.getItem(
        storageKey(user.id, `currentLocation.${organizationId}`),
      );
      const nextLocationId =
        (storedLocationId && options.some((l) => l.id === storedLocationId)
          ? storedLocationId
          : options[0]?.id) ?? null;
      setLocationId(nextLocationId);
      setLoading(false);
    })();
  }, [organizationId, user]);

  const switchOrganization = useCallback(
    (nextOrganizationId: string) => {
      if (user) {
        localStorage.setItem(
          storageKey(user.id, "currentOrg"),
          nextOrganizationId,
        );
      }
      setOrganizationId(nextOrganizationId);
    },
    [user],
  );

  const switchLocation = useCallback(
    (nextLocationId: string) => {
      if (user && organizationId) {
        localStorage.setItem(
          storageKey(user.id, `currentLocation.${organizationId}`),
          nextLocationId,
        );
      }
      setLocationId(nextLocationId);
    },
    [user, organizationId],
  );

  const createOrganization = useCallback(
    async (newOrganizationName: string, newLocationName?: string) => {
      const { error: rpcError } = await supabase.rpc(
        "create_organization_with_location",
        {
          organization_name: newOrganizationName,
          location_name: newLocationName || "Main Location",
        },
      );
      if (rpcError) return { error: rpcError.message };
      await loadMemberships();
      return { error: null };
    },
    [loadMemberships],
  );

  const acceptInvite = useCallback(
    async (targetOrganizationId: string) => {
      if (!user) return { error: "Not signed in" };
      const { error: updateError } = await supabase
        .from("organization_members")
        .update({ status: "active", joined_at: new Date().toISOString() })
        .eq("organization_id", targetOrganizationId)
        .eq("user_id", user.id);
      if (updateError) return { error: updateError.message };
      await loadMemberships();
      return { error: null };
    },
    [user, loadMemberships],
  );

  const declineInvite = useCallback(
    async (targetOrganizationId: string) => {
      if (!user) return { error: "Not signed in" };
      const { error: deleteError } = await supabase
        .from("organization_members")
        .delete()
        .eq("organization_id", targetOrganizationId)
        .eq("user_id", user.id);
      if (deleteError) return { error: deleteError.message };
      await loadMemberships();
      return { error: null };
    },
    [user, loadMemberships],
  );

  const current = memberships.find((m) => m.organizationId === organizationId);
  const currentLocation = locations.find((l) => l.id === locationId);

  const value = useMemo<OrganizationContextValue>(
    () => ({
      loading,
      memberships,
      pendingInvites,
      organizationId,
      organizationName: current?.organizationName ?? null,
      locations,
      locationId,
      locationName: currentLocation?.name ?? null,
      role: current?.role ?? null,
      error,
      switchOrganization,
      switchLocation,
      createOrganization,
      acceptInvite,
      declineInvite,
      refresh: loadMemberships,
    }),
    [
      loading,
      memberships,
      pendingInvites,
      organizationId,
      current,
      locations,
      locationId,
      currentLocation,
      error,
      switchOrganization,
      switchLocation,
      createOrganization,
      acceptInvite,
      declineInvite,
      loadMemberships,
    ],
  );

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook is tightly coupled to this provider's context
export function useOrganization() {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error(
      "useOrganization must be used within an OrganizationProvider",
    );
  }
  return context;
}
