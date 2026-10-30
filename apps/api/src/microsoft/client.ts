import { Logger } from '@nestjs/common';
import { microsoftApiUrl } from './url-policy';

/**
 * Talking to Microsoft: one app registration, every customer's own tenant.
 *
 * The EPMO registers a single multi-tenant application. A customer's
 * administrator consents to it inside their own Microsoft tenant, and from
 * then on we act as the person who consented, against their SharePoint, their
 * OneDrive and their Power BI. Nothing is copied here; their files never leave
 * their tenancy, and revoking the consent in Entra ID is a complete and
 * instant disconnection that does not depend on us honouring it.
 *
 * Two resources, two sets of scopes. Microsoft issues an access token for one
 * resource at a time, so Graph and Power BI are separate exchanges of the same
 * refresh token — and separate consents, because asking for Power BI up front
 * would make a customer who only wants document storage approve reporting
 * access they never use.
 */

export type Resource = 'graph' | 'powerbi';

const AUTHORITY = () =>
  process.env.MS_AUTHORITY ?? 'https://login.microsoftonline.com/organizations';

export const GRAPH = 'https://graph.microsoft.com/v1.0';
export const POWERBI = 'https://api.powerbi.com/v1.0/myorg';

/**
 * What we ask for, and why each one.
 *
 * Files.ReadWrite.All and Sites.ReadWrite.All are delegated — they grant only
 * what the signed-in person can already do, so a consultant who cannot see a
 * site does not gain access to it by our asking. offline_access is the refresh
 * token; without it the connection would die the first time an access token
 * expired, about an hour in.
 */
export const SCOPES: Record<Resource, string[]> = {
  graph: ['offline_access', 'openid', 'profile', 'email', 'User.Read',
          'Files.ReadWrite.All', 'Sites.ReadWrite.All'],
  powerbi: ['offline_access', 'openid', 'profile',
            'https://analysis.windows.net/powerbi/api/Report.Read.All',
            'https://analysis.windows.net/powerbi/api/Dataset.Read.All',
            'https://analysis.windows.net/powerbi/api/Workspace.Read.All'],
};

export type MsConfig = { clientId: string; clientSecret: string; redirectUri: string };

/** Null when the app registration has not been configured yet. */
export function msConfig(): MsConfig | null {
  const clientId = process.env.MS_CLIENT_ID ?? '';
  const clientSecret = process.env.MS_CLIENT_SECRET ?? '';
  const redirectUri = process.env.MS_REDIRECT_URI ?? '';
  if (!clientId || !clientSecret || !redirectUri) return null;
  return { clientId, clientSecret, redirectUri };
}

export function authorizeUrl(cfg: MsConfig, resource: Resource, state: string): string {
  const u = new URL(`${AUTHORITY()}/oauth2/v2.0/authorize`);
  u.searchParams.set('client_id', cfg.clientId);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', cfg.redirectUri);
  u.searchParams.set('response_mode', 'query');
  u.searchParams.set('scope', SCOPES[resource].join(' '));
  u.searchParams.set('state', state);
  // Consent accumulates against the same app, so the second resource asks only
  // for what the first did not already cover.
  u.searchParams.set('prompt', 'select_account');
  return u.toString();
}

export type TokenSet = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
  idToken: string | null;
};

async function token(cfg: MsConfig, body: Record<string, string>): Promise<TokenSet> {
  const res = await fetch(`${AUTHORITY()}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: cfg.clientId, client_secret: cfg.clientSecret, ...body,
    }),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new MsAuthError(j?.error ?? 'invalid_request', j?.error_description ?? `HTTP ${res.status}`);
  return {
    accessToken: j.access_token,
    refreshToken: j.refresh_token ?? null,
    expiresAt: Date.now() + Number(j.expires_in ?? 3600) * 1000,
    scope: j.scope ?? '',
    idToken: j.id_token ?? null,
  };
}

export const exchangeCode = (cfg: MsConfig, code: string, resource: Resource) =>
  token(cfg, { grant_type: 'authorization_code', code, redirect_uri: cfg.redirectUri,
               scope: SCOPES[resource].join(' ') });

export const refresh = (cfg: MsConfig, refreshToken: string, resource: Resource) =>
  token(cfg, { grant_type: 'refresh_token', refresh_token: refreshToken,
               scope: SCOPES[resource].join(' ') });

/**
 * A refusal from Microsoft, kept apart from our own errors.
 *
 * `needsConsent` is the one a caller must handle rather than merely report:
 * it means the connection is sound but this resource was never approved, and
 * the answer is to send the person through consent again, not to reconnect
 * from scratch and lose the half that works.
 */
export class MsAuthError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'MsAuthError';
  }
  /** AADSTS65001 is "the user or administrator has not consented". */
  get needsConsent() {
    return this.code === 'invalid_grant' && /AADSTS65001|consent/i.test(this.message);
  }
  /** The refresh token itself is dead — revoked, expired, or password changed. */
  get needsReconnect() {
    return this.code === 'invalid_grant' && !this.needsConsent;
  }
}

/** The claims we take off the id_token: who consented, and in whose tenant. */
export function readIdToken(idToken: string | null): {
  tid: string | null; email: string | null; name: string | null;
} {
  if (!idToken) return { tid: null, email: null, name: null };
  try {
    // Signature is not checked, deliberately. This token came back over TLS
    // from the token endpoint in direct response to our own request with our
    // own secret — it is not attacker-supplied, and the claims are used only
    // to label the connection on screen.
    const [, payload] = idToken.split('.');
    const c = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return {
      tid: c.tid ?? null,
      email: c.preferred_username ?? c.email ?? c.upn ?? null,
      name: c.name ?? null,
    };
  } catch {
    return { tid: null, email: null, name: null };
  }
}

const log = new Logger('Microsoft');

/** A failed Graph or Power BI call, with Microsoft's own message kept intact. */
export class MsApiError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
    this.name = 'MsApiError';
  }
}

/**
 * One call to Graph or Power BI.
 *
 * Microsoft's own error bodies are more useful than anything we would write in
 * their place — "The sharing link already exists", "Item not found" — so they
 * are passed through rather than flattened into "request failed".
 */
export async function call<T>(base: string, accessToken: string, path: string, init: {
  method?: string; body?: string | Uint8Array; headers?: Record<string, string>;
} = {}): Promise<T> {
  const url = microsoftApiUrl(base, path);
  const res = await fetch(url, {
    // Never forward delegated bearer credentials through an upstream redirect.
    redirect: 'error',
    method: init.method ?? 'GET',
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body && !init.headers?.['content-type'] ? { 'content-type': 'application/json' } : {}),
      ...init.headers,
    },
    body: init.body,
  });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const e = json?.error ?? {};
    const message = e.message ?? e.detail ?? json?.message ?? `HTTP ${res.status}`;
    // The upstream URL and error body may contain tenant data, auth codes or tokens.
    log.warn(`Microsoft API request failed (HTTP ${res.status})`);
    throw new MsApiError(res.status, e.code ?? String(res.status), message);
  }
  return json as T;
}

/** Follows @odata.nextLink. Graph pages at 200 items and we want the lot. */
export async function callAll<T>(base: string, accessToken: string, path: string,
                                 cap = 2000): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = path;
  while (next && out.length < cap) {
    const page: any = await call<any>(base, accessToken, next);
    out.push(...(page?.value ?? []));
    next = page?.['@odata.nextLink'];
  }
  return out;
}
