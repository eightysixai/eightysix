import { useEffect, useState } from "react";
import { useOrganization } from "../../context/OrganizationContext";
import { getPlanLimits } from "../../lib/billing-plans";
import { todayISO } from "../../lib/format";
import { supabase } from "../../lib/supabase";

interface OrgRow {
  name: string;
  plan: string;
}

interface LocationRow {
  id: string;
  name: string;
  timezone: string;
  currency_code: string;
  active: boolean;
}

export function OrganizationPage() {
  const { organizationId, refresh } = useOrganization();
  const [org, setOrg] = useState<OrgRow | null>(null);
  const [orgName, setOrgName] = useState("");
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [newLocationName, setNewLocationName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function load() {
    if (!organizationId) return;
    const [{ data: orgData }, { data: locationData }] = await Promise.all([
      supabase
        .from("organizations")
        .select("name, plan")
        .eq("id", organizationId)
        .single(),
      supabase
        .from("locations")
        .select("id, name, timezone, currency_code, active")
        .eq("organization_id", organizationId)
        .order("created_at", { ascending: true }),
    ]);
    setOrg(orgData);
    setOrgName(orgData?.name ?? "");
    setLocations(locationData ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial/refetch load of org + locations, not a derivation of other state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  async function handleSaveName() {
    if (!organizationId || !orgName.trim()) return;
    setError(null);
    setSaved(false);
    const { error: updateError } = await supabase
      .from("organizations")
      .update({ name: orgName.trim() })
      .eq("id", organizationId);
    if (updateError) setError(updateError.message);
    else {
      setSaved(true);
      refresh();
    }
  }

  const limits = getPlanLimits(org?.plan ?? "free");
  const atLocationLimit = locations.length >= limits.maxLocations;

  async function handleAddLocation() {
    if (!organizationId || !newLocationName.trim()) return;
    if (atLocationLimit) {
      setError(
        `Your current plan allows up to ${limits.maxLocations} location(s). Upgrade in Billing to add more.`,
      );
      return;
    }
    setError(null);
    const slug =
      newLocationName
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || `location-${todayISO()}`;
    const { error: insertError } = await supabase.from("locations").insert({
      organization_id: organizationId,
      name: newLocationName.trim(),
      slug: `${slug}-${Math.random().toString(36).slice(2, 8)}`,
    });
    if (insertError) setError(insertError.message);
    else {
      setNewLocationName("");
      load();
    }
  }

  async function handleDeactivateLocation(location: LocationRow) {
    const { error: updateError } = await supabase
      .from("locations")
      .update({ active: false })
      .eq("id", location.id);
    if (updateError) setError(updateError.message);
    else load();
  }

  return (
    <>
      {error && (
        <p className="form-error" onClick={() => setError(null)}>
          {error}
        </p>
      )}

      <section className="panel">
        <div className="panel-header">
          <h2>Organization</h2>
        </div>
        <div className="form-row">
          <label>
            Restaurant Name
            <input
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
            />
          </label>
        </div>
        <div className="modal-footer" style={{ border: "none", padding: 0 }}>
          <div />
          <div className="modal-actions">
            {saved && (
              <span style={{ color: "var(--under)", fontSize: 13 }}>
                Saved
              </span>
            )}
            <button className="btn btn-primary" onClick={handleSaveName}>
              Save
            </button>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Locations</h2>
        </div>
        <p className="panel-caption">
          {locations.length} of{" "}
          {Number.isFinite(limits.maxLocations) ? limits.maxLocations : "∞"}{" "}
          locations used on your current plan.
        </p>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Timezone</th>
              <th>Currency</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {locations
              .filter((l) => l.active)
              .map((location) => (
                <tr key={location.id}>
                  <td>{location.name}</td>
                  <td>{location.timezone}</td>
                  <td>{location.currency_code}</td>
                  <td>
                    {locations.filter((l) => l.active).length > 1 && (
                      <button
                        className="icon-btn"
                        title="Deactivate"
                        onClick={() => handleDeactivateLocation(location)}
                      >
                        &times;
                      </button>
                    )}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        <div className="form-row" style={{ marginTop: 16 }}>
          <label>
            New Location Name
            <input
              type="text"
              value={newLocationName}
              onChange={(e) => setNewLocationName(e.target.value)}
              placeholder="e.g. Downtown"
            />
          </label>
        </div>
        <button
          className="btn btn-primary"
          onClick={handleAddLocation}
          disabled={atLocationLimit}
        >
          Add Location
        </button>
      </section>
    </>
  );
}
