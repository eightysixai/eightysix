import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { useOrganization } from "../../context/OrganizationContext";
import { supabase } from "../../lib/supabase";

const PROVIDERS = [
  {
    key: "quickbooks",
    integrationType: "accounting",
    label: "QuickBooks Online",
  },
  { key: "xero", integrationType: "accounting", label: "Xero" },
  { key: "square", integrationType: "pos", label: "Square" },
  { key: "clover", integrationType: "pos", label: "Clover" },
] as const;

interface ConnectionRow {
  provider: string;
  integration_type: string;
  status: string;
  last_error: string | null;
  last_synced_at: string | null;
}

export function IntegrationsPage() {
  const { organizationId, locationId } = useOrganization();
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [busyProvider, setBusyProvider] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchParams] = useSearchParams();

  async function load() {
    if (!organizationId) return;
    const { data } = await supabase
      .from("integration_connections")
      .select("provider, integration_type, status, last_error, last_synced_at")
      .eq("organization_id", organizationId);
    setConnections(data ?? []);
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial/refetch load of connection status, not a derivation of other state
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId]);

  const connectionResult = searchParams.get("connection");

  async function handleConnect(providerKey: string) {
    if (!organizationId) return;
    setBusyProvider(providerKey);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke(
      "integrations-oauth-start",
      { body: { organizationId, locationId, provider: providerKey } },
    );
    setBusyProvider(null);
    if (fnError || data?.error) {
      setError(fnError?.message ?? data?.error ?? "Failed to start connection");
      return;
    }
    window.location.href = data.url;
  }

  return (
    <>
      {connectionResult === "success" && (
        <p style={{ color: "var(--under)", fontSize: 13, marginBottom: 16 }}>
          Connected successfully.
        </p>
      )}
      {connectionResult === "error" && (
        <p className="form-error">
          {searchParams.get("message") ?? "Connection failed"}
        </p>
      )}
      {error && <p className="form-error">{error}</p>}

      <section className="panel">
        <div className="panel-header">
          <h2>Accounting</h2>
        </div>
        <p className="panel-caption">
          Connect a provider to sync invoices and expenses automatically.
          Actual data import runs separately once connected — this sets up
          the OAuth connection.
        </p>
        <IntegrationRows
          providers={PROVIDERS.filter((p) => p.integrationType === "accounting")}
          connections={connections}
          busyProvider={busyProvider}
          onConnect={handleConnect}
        />
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Point of Sale</h2>
        </div>
        <p className="panel-caption">
          Connect a POS provider to import daily sales automatically.
        </p>
        <IntegrationRows
          providers={PROVIDERS.filter((p) => p.integrationType === "pos")}
          connections={connections}
          busyProvider={busyProvider}
          onConnect={handleConnect}
        />
      </section>
    </>
  );
}

function IntegrationRows({
  providers,
  connections,
  busyProvider,
  onConnect,
}: {
  providers: readonly { key: string; integrationType: string; label: string }[];
  connections: ConnectionRow[];
  busyProvider: string | null;
  onConnect: (providerKey: string) => void;
}) {
  return (
    <table>
      <thead>
        <tr>
          <th>Provider</th>
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {providers.map((provider) => {
          const connection = connections.find(
            (c) => c.provider === provider.key,
          );
          const status = connection?.status ?? "disconnected";
          return (
            <tr key={provider.key}>
              <td>{provider.label}</td>
              <td>
                <span
                  className={`status-pill ${status === "active" ? "under" : status === "error" ? "over" : ""}`}
                >
                  {status}
                </span>
                {connection?.last_error && (
                  <div className="subtitle" style={{ fontSize: 11 }}>
                    {connection.last_error}
                  </div>
                )}
              </td>
              <td>
                <button
                  className="btn btn-secondary"
                  onClick={() => onConnect(provider.key)}
                  disabled={busyProvider === provider.key}
                >
                  {busyProvider === provider.key
                    ? "Connecting…"
                    : status === "active"
                      ? "Reconnect"
                      : "Connect"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
