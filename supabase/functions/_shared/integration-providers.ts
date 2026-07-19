// Provider registry for the accounting/POS integration scaffold. Each entry
// is enough to build a standard OAuth2 authorization-code flow; none of this
// is secret (client secrets live in env vars, not here). Extend this list to
// add more providers — the start/callback functions are provider-agnostic.
export interface IntegrationProvider {
  key: string;
  integrationType: "accounting" | "pos";
  label: string;
  authorizeUrl: string;
  tokenUrl: string;
  scope: string;
  /** Env var names this provider's client id/secret are read from. */
  clientIdEnv: string;
  clientSecretEnv: string;
  /** Extra fixed query params some providers require (e.g. Xero's audience). */
  extraAuthorizeParams?: Record<string, string>;
}

export const INTEGRATION_PROVIDERS: IntegrationProvider[] = [
  {
    key: "quickbooks",
    integrationType: "accounting",
    label: "QuickBooks Online",
    authorizeUrl: "https://appcenter.intuit.com/connect/oauth2",
    tokenUrl: "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer",
    scope: "com.intuit.quickbooks.accounting",
    clientIdEnv: "QUICKBOOKS_CLIENT_ID",
    clientSecretEnv: "QUICKBOOKS_CLIENT_SECRET",
  },
  {
    key: "xero",
    integrationType: "accounting",
    label: "Xero",
    authorizeUrl: "https://login.xero.com/identity/connect/authorize",
    tokenUrl: "https://identity.xero.com/connect/token",
    scope: "openid profile email accounting.transactions accounting.contacts offline_access",
    clientIdEnv: "XERO_CLIENT_ID",
    clientSecretEnv: "XERO_CLIENT_SECRET",
  },
  {
    key: "square",
    integrationType: "pos",
    label: "Square",
    authorizeUrl: "https://connect.squareup.com/oauth2/authorize",
    tokenUrl: "https://connect.squareup.com/oauth2/token",
    scope: "ORDERS_READ MERCHANT_PROFILE_READ",
    clientIdEnv: "SQUARE_CLIENT_ID",
    clientSecretEnv: "SQUARE_CLIENT_SECRET",
  },
  {
    key: "clover",
    integrationType: "pos",
    label: "Clover",
    authorizeUrl: "https://www.clover.com/oauth/authorize",
    tokenUrl: "https://www.clover.com/oauth/token",
    scope: "",
    clientIdEnv: "CLOVER_CLIENT_ID",
    clientSecretEnv: "CLOVER_CLIENT_SECRET",
  },
];

export function findProvider(key: string) {
  return INTEGRATION_PROVIDERS.find((p) => p.key === key) ?? null;
}
