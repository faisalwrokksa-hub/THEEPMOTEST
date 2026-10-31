import { Injectable, Logger, BadRequestException, NotFoundException,
         ConflictException, ServiceUnavailableException, ForbiddenException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { safeMicrosoftReturnPath } from './return-path';
import { microsoftUploadUrl } from './url-policy';
import { safeDocumentRedirectUrl } from './document-redirect-policy';
import { readBoundedMicrosoftJson, MAX_MICROSOFT_API_RESPONSE_BYTES } from './response-policy';
import { sql } from 'drizzle-orm';
import { withTenant, auditEvents } from '@pmo/db';
import { currentContext } from '../tenancy/tenant-context';
import { requireCapability } from '../common/require-capability';
import { can } from '@pmo/contracts';
import { redactMicrosoftConnection } from './connection-policy';
import { canUseDelegatedMicrosoftConnection, isActiveDelegatedMicrosoftConnection } from './delegated-user-policy';
import { deploymentAllowsTenant, parseRuntimeDeployment } from '../tenancy/deployment-runtime';
import { seal, open, canSealTokens } from './crypto';
import { msConfig, authorizeUrl, exchangeCode, refresh, readIdToken, call, callAll,
         GRAPH, POWERBI, MsAuthError, MsApiError, type Resource, type MsConfig } from './client';

const rows = (r: unknown) => r as unknown as any[];
const PROVIDER = 'microsoft';

/** A folder name a customer's SharePoint will accept. */
const safeName = (s: string) =>
  String(s).replace(/[\\/:*?"<>|#%]/g, '-').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Untitled';

export type Connection = {
  id: string; status: string;
  accountEmail: string | null; accountName: string | null;
  externalTenantId: string | null; scopes: string | null;
  siteId: string | null; siteName: string | null; siteUrl: string | null;
  driveId: string | null; driveName: string | null;
  rootItemId: string | null; rootPath: string | null;
  connectedAt: string | null; lastError: string | null;
};

@Injectable()
export class MicrosoftService {
  private readonly log = new Logger('Microsoft');
  // The OAuth callback is public and never passes through TenantMiddleware.
  // Use the same trusted runtime inventory as authenticated API and login routes.
  private readonly runtimeDeployment = parseRuntimeDeployment(process.env);

  /**
   * Access tokens, in memory only.
   *
   * They last an hour and are worthless after that, so persisting them would
   * add a second secret at rest to protect for no gain. Keyed by workspace and
   * resource, because one process serves every customer and handing one
   * tenant's token to another is the whole of the damage this could do.
   * Cache keys also include the consenting EPMO user; a workspace is not a
   * license to reuse somebody else's delegated Microsoft identity.
   */
  private readonly tokens = new Map<string, { accessToken: string; expiresAt: number; credential: string }>();

  private ctx() { return currentContext(); }

  private invalidateTenantTokens(tenantId: string) {
    for (const key of this.tokens.keys()) {
      if (key.startsWith(`${tenantId}:`)) this.tokens.delete(key);
    }
  }

  private config(): MsConfig {
    const cfg = msConfig();
    if (!cfg) {
      throw new ServiceUnavailableException(
        'Microsoft is not configured on this server yet. An administrator needs to register the ' +
        'application in Entra ID and set MS_CLIENT_ID, MS_CLIENT_SECRET and MS_REDIRECT_URI.');
    }
    if (!canSealTokens()) {
      throw new ServiceUnavailableException(
        'MS_TOKEN_KEY is not set, so a Microsoft connection cannot be stored safely. ' +
        'Generate one with:  openssl rand -base64 32');
    }
    return cfg;
  }

  /** Whether this server could connect at all, for the page to say so plainly. */
  configured() {
    return { configured: Boolean(msConfig()) && canSealTokens(),
             redirectUri: process.env.MS_REDIRECT_URI ?? null };
  }

  private async audit(tx: any, entityId: string, action: string, diff?: unknown) {
    const { tenantId, userId } = this.ctx();
    await tx.insert(auditEvents).values({
      tenantId, actorId: userId, entity: 'integration', entityId, action, diff: (diff ?? null) as any,
    });
  }

  /* ── the connection itself ─────────────────────────────────────────── */

  /** What this workspace has connected, with no secret in it. */
  async status(): Promise<{ configured: boolean; connection: Connection | null }> {
    const { tenantId } = this.ctx();
    const configured = Boolean(msConfig()) && canSealTokens();
    const row = await withTenant(tenantId, async (tx) => (rows(await tx.execute(sql`
      SELECT id, status, connected_by, account_email, account_name, external_tenant_id, scopes,
             site_id, site_name, site_url, drive_id, drive_name, root_item_id, root_path,
             connected_at, last_error
      FROM integration_connections WHERE provider = ${PROVIDER}`)))[0]);
    if (!row) return { configured, connection: null };
    const connection: Connection = {
      id: row.id, status: row.status,
      accountEmail: row.account_email, accountName: row.account_name,
      externalTenantId: row.external_tenant_id, scopes: row.scopes,
      siteId: row.site_id, siteName: row.site_name, siteUrl: row.site_url,
      driveId: row.drive_id, driveName: row.drive_name,
      rootItemId: row.root_item_id, rootPath: row.root_path,
      connectedAt: row.connected_at ? new Date(row.connected_at).toISOString() : null,
      lastError: row.last_error,
    };
    return { configured, connection: redactMicrosoftConnection(
      // A workspace administrator is not automatically the consenting Microsoft
      // identity. Hide the other administrator's account, sites and errors.
      connection, can(this.ctx().capabilities ?? [], 'pmoa_admin') &&
        canUseDelegatedMicrosoftConnection(row.connected_by, this.ctx().userId)) };
  }

  /**
   * Begin the handshake. Returns the Microsoft URL to send the person to.
   *
   * The state is random, single-use, expires in ten minutes and records which
   * workspace started it. Without that, a callback captured from one person's
   * browser could be replayed to attach their Microsoft account to somebody
   * else's workspace.
   */
  async beginConnect(resource: Resource, returnTo: string): Promise<{ url: string }> {
    requireCapability('pmoa_admin');
    const cfg = this.config();
    const { tenantId, userId } = this.ctx();

    /*
     * The state carries the workspace id in front of the random part.
     *
     * Not for secrecy — a workspace id is not secret, and the person's own
     * session already knows it. It is because the callback arrives from
     * Microsoft with no session and no tenant set, and row-level security
     * means a query with no tenant sees nothing at all: the state row was
     * invisible to the request that needed to read it, so a connection could
     * be started and never finished. Naming the workspace lets the callback
     * open the right scope and then look the row up properly.
     *
     * Forging the front half gains nothing. The lookup matches the whole
     * string, so a different workspace id simply finds no row, and the random
     * half is still what makes the state unguessable and single-use.
     */
    const state = `${tenantId}.${randomBytes(32).toString('base64url')}`;

    await withTenant(tenantId, async (tx) => {
      // The resource rides along in the row rather than the state string, so
      // nothing about which permissions are being requested is attacker-set.
      await tx.execute(sql`
        DELETE FROM oauth_states WHERE provider LIKE ${`${PROVIDER}%`} AND expires_at < now()`);
      await tx.execute(sql`
        INSERT INTO oauth_states (tenant_id, provider, state, user_id, return_to, expires_at)
        VALUES (${tenantId}, ${`${PROVIDER}:${resource}`}, ${state}, ${userId},
                ${safeMicrosoftReturnPath(returnTo)}, now() + interval '10 minutes')`);
    });
    return { url: authorizeUrl(cfg, resource, state) };
  }

  /**
   * Finish the handshake.
   *
   * Runs with no session: the browser is coming back from Microsoft, not from
   * us. The workspace therefore comes from the state, which is why the state
   * has to be unguessable, single-use and short-lived — those three properties
   * are the whole of the authentication on this route.
   */
  async completeConnect(code: string, state: string): Promise<{ returnTo: string }> {
    const cfg = this.config();

    const tenantId = state.split('.')[0];
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(tenantId ?? '')) {
      throw new BadRequestException(
        'That sign-in link has expired or has already been used. Start the connection again.');
    }

    // The state prefix is untrusted. A valid state issued on another deployment
    // must not let this public callback consume its row or write credentials.
    // Reject before opening a tenant-scoped database transaction or exchanging
    // an authorization code, using the same generic invalid-state response.
    if (!deploymentAllowsTenant(this.runtimeDeployment, tenantId)) {
      throw new BadRequestException(
        'That sign-in link has expired or has already been used. Start the connection again.');
    }

    const st = await withTenant(tenantId, async (tx) => (rows(await tx.execute(sql`
      DELETE FROM oauth_states
      WHERE state = ${state} AND expires_at > now()
      RETURNING tenant_id, provider, user_id, return_to`)))[0]);
    if (!st) {
      throw new BadRequestException(
        'That sign-in link has expired or has already been used. Start the connection again.');
    }
    const resource: Resource = st.provider.endsWith(':powerbi') ? 'powerbi' : 'graph';

    let tok;
    try {
      tok = await exchangeCode(cfg, code, resource);
    } catch (e) {
      const msg = 'Microsoft authorization failed. Reconnect and try again.';
      await withTenant(tenantId, async (tx) => {
        await tx.execute(sql`
          UPDATE integration_connections SET status = 'error', last_error = ${msg}, updated_at = now()
          WHERE provider = ${PROVIDER} AND connected_by = ${st.user_id}`);
      });
      throw new BadRequestException(`Microsoft refused the connection: ${msg}`);
    }
    if (!tok.refreshToken) {
      throw new BadRequestException(
        'Microsoft did not return a refresh token. The app registration needs the ' +
        'offline_access scope for the connection to outlive the first hour.');
    }

    const who = readIdToken(tok.idToken);
    await withTenant(tenantId, async (tx) => {
      // Consent was initiated while the user was an administrator, but the
      // membership may have been suspended or downgraded during the redirect.
      // Recheck inside the token-write transaction and lock the membership so
      // a concurrent role change cannot race the connection commit.
      const [authorized] = rows(await tx.execute(sql`
        SELECT m.id FROM memberships AS m
        WHERE m.tenant_id = ${tenantId}
          AND m.user_id = ${st.user_id}
          AND m.is_active = true
          AND m.role IN ('owner', 'admin', 'client_admin')
        FOR SHARE OF m`));
      if (!authorized) {
        throw new ForbiddenException(
          'Your workspace administrator access changed during Microsoft sign-in. Start again after access is restored.');
      }
      const [saved] = rows(await tx.execute(sql`
        INSERT INTO integration_connections
          (tenant_id, provider, status, external_tenant_id, account_email, account_name,
           scopes, refresh_token, connected_by, connected_at, last_error, updated_at)
        VALUES (${tenantId}, ${PROVIDER}, 'connected', ${who.tid}, ${who.email}, ${who.name},
                ${tok.scope}, ${seal(tok.refreshToken!)}, ${st.user_id}, now(), NULL, now())
        ON CONFLICT (tenant_id, provider) DO UPDATE SET
          status = 'connected',
          external_tenant_id = EXCLUDED.external_tenant_id,
          account_email = EXCLUDED.account_email,
          account_name = EXCLUDED.account_name,
          -- Consent accumulates, so the scope string grows rather than being
          -- replaced: connecting Power BI must not look like losing Files.
          scopes = (
            SELECT string_agg(DISTINCT s, ' ')
            FROM unnest(string_to_array(
              coalesce(integration_connections.scopes, '') || ' ' || EXCLUDED.scopes, ' ')) AS s
            WHERE s <> ''),
          refresh_token = EXCLUDED.refresh_token,
          connected_by = EXCLUDED.connected_by,
          connected_at = coalesce(integration_connections.connected_at, EXCLUDED.connected_at),
          last_error = NULL,
          updated_at = now()
        WHERE integration_connections.connected_by = EXCLUDED.connected_by
        RETURNING id`));
      if (!saved) {
        throw new ConflictException(
          'Another user owns this Microsoft connection. Ask the owner to disconnect before reconnecting.');
      }

      await tx.insert(auditEvents).values({
        tenantId, actorId: st.user_id, entity: 'integration',
        entityId: PROVIDER, action: 'microsoft.connected',
        diff: { resource, account: who.email, msTenant: who.tid } as any,
      });
    });

    // The in-memory token for this workspace is now stale in both directions.
    this.invalidateTenantTokens(tenantId);

    // Connection details and email are retained in tenant-scoped audit history.
    this.log.log(`Microsoft ${resource} connection completed`);
    return { returnTo: st.return_to ?? '/integrations' };
  }

  /**
   * Forget the connection.
   *
   * Only ever deletes our copy of the token. The customer's files are theirs
   * and stay exactly where they are; document rows keep pointing at them, so
   * reconnecting restores every link rather than orphaning them. Saying this
   * on screen matters — "Disconnect" sounds like it deletes something.
   */
  async disconnect(): Promise<{ ok: true; documentsStillLinked: number }> {
    requireCapability('pmoa_admin');
    const { tenantId, userId } = this.ctx();
    return withTenant(tenantId, async (tx) => {
      const [n] = rows(await tx.execute(sql`
        SELECT count(*)::int AS n FROM documents WHERE storage_provider = ${PROVIDER}`));
      const [gone] = rows(await tx.execute(sql`
        DELETE FROM integration_connections
        WHERE provider = ${PROVIDER} AND (connected_by = ${userId} OR connected_by IS NULL)
        RETURNING id`));
      if (!gone) throw new NotFoundException('Microsoft is not connected to this workspace.');
      this.invalidateTenantTokens(tenantId);
      await this.audit(tx, PROVIDER, 'microsoft.disconnected', { documentsStillLinked: n.n });
      return { ok: true as const, documentsStillLinked: n.n };
    });
  }

  /* ── tokens ───────────────────────────────────────────────────────── */

  /**
   * An access token for one resource, refreshed when it has nearly run out.
   *
   * Sixty seconds of margin: a token that passes the check and then expires
   * while the request is in flight fails as a 401 the caller cannot usefully
   * explain.
   */
  private async accessToken(resource: Resource): Promise<string> {
    const cfg = this.config();
    const { tenantId, userId } = this.ctx();
    const cacheKey = `${tenantId}:${userId}:${resource}`;

    // Check the database owner BEFORE any cached token can be returned.
    // The legacy schema stores one delegated connection per workspace; that
    // does not authorize a different workspace administrator to impersonate
    // the person who consented. Unowned legacy rows fail closed.
    const [row] = await withTenant(tenantId, async (tx) => rows(await tx.execute(sql`
      SELECT refresh_token, connected_by, status FROM integration_connections WHERE provider = ${PROVIDER}`)));
    if (!row?.refresh_token) {
      this.tokens.delete(cacheKey);
      throw new ConflictException('Microsoft is not connected to this workspace yet.');
    }
    if (!canUseDelegatedMicrosoftConnection(row.connected_by, userId)) {
      this.tokens.delete(cacheKey);
      throw new ForbiddenException(
        'This Microsoft connection belongs to another user. Connect your own Microsoft account.');
    }
    // A failed/revoked connection must not keep serving a previously cached
    // Graph or Power BI access token. Revocation applies across resources.
    if (!isActiveDelegatedMicrosoftConnection(row.status)) {
      this.invalidateTenantTokens(tenantId);
      throw new ConflictException('Microsoft connection is inactive. Reconnect the account.');
    }
    const hit = this.tokens.get(cacheKey);
    if (hit && hit.credential === row.refresh_token && hit.expiresAt > Date.now() + 60_000) return hit.accessToken;

    let tok;
    try {
      tok = await refresh(cfg, open(row.refresh_token), resource);
    } catch (e) {
      if (e instanceof MsAuthError && e.needsConsent) {
        throw new ConflictException(
          resource === 'powerbi'
            ? 'Power BI has not been approved for this workspace yet. Connect Power BI to grant it.'
            : 'Microsoft needs to be connected again to grant this permission.');
      }
      this.invalidateTenantTokens(tenantId);
      const msg = 'Microsoft credentials are invalid or have expired. Reconnect the account.';
      await withTenant(tenantId, async (tx) => {
        await tx.execute(sql`
          UPDATE integration_connections SET status = 'error', last_error = ${msg}, updated_at = now()
          WHERE provider = ${PROVIDER} AND connected_by = ${userId}
            AND refresh_token = ${row.refresh_token}`);
      });
      throw new ConflictException(
        'The Microsoft connection is no longer valid — it may have been revoked, or the ' +
        'password changed. Connect it again.');
    }

    // Microsoft may rotate the refresh token or return no replacement.
    // Either network call can outlive a disconnect, reconnect or credential
    // rotation. Require the original consenting user and exact credential to
    // still exist before caching or returning the refreshed access token.
    const credential = tok.refreshToken ? seal(tok.refreshToken) : row.refresh_token;
    const updated = await withTenant(tenantId, async (tx) => rows(await tx.execute(sql`
        UPDATE integration_connections
        SET refresh_token = ${credential}, status = 'connected',
            last_error = NULL, last_used_at = now(), updated_at = now()
        WHERE provider = ${PROVIDER} AND connected_by = ${userId}
          AND status = 'connected' AND refresh_token = ${row.refresh_token}
        RETURNING id`)));
    if (!updated.length) {
      this.tokens.delete(cacheKey);
      throw new ConflictException('Microsoft connection changed during refresh. Reconnect and retry.');
    }
    this.tokens.set(cacheKey, { accessToken: tok.accessToken, expiresAt: tok.expiresAt, credential });
    return tok.accessToken;
  }

  /* ── where the files go ───────────────────────────────────────────── */

  /** Their SharePoint sites, plus the signed-in person's own OneDrive. */
  async places(query?: string) {
    requireCapability('pmoa_admin');
    const token = await this.accessToken('graph');
    const search = (query ?? '').trim();
    // Graph's site search needs something to search for; '*' is its own
    // documented way of saying "everything this person can see".
    const sites = await callAll<any>(GRAPH, token,
      `/sites?search=${encodeURIComponent(search || '*')}`, 200);

    const me = await call<any>(GRAPH, token, '/me/drive').catch(() => null);
    return {
      oneDrive: me ? { driveId: me.id, name: me.name ?? 'OneDrive', url: me.webUrl } : null,
      sites: sites.map((s) => ({
        siteId: s.id, name: s.displayName ?? s.name, url: s.webUrl,
      })),
    };
  }

  /** The document libraries inside one site. */
  async drives(siteId: string) {
    requireCapability('pmoa_admin');
    const token = await this.accessToken('graph');
    const list = await callAll<any>(GRAPH, token, `/sites/${encodeURIComponent(siteId)}/drives`);
    return list.map((d) => ({ driveId: d.id, name: d.name, url: d.webUrl }));
  }

  /**
   * Choose where this workspace's documents live, and make the folder.
   *
   * One folder, named for the workspace, with a folder per project created
   * underneath it on first upload. Writing into the root of a customer's
   * document library instead would scatter our files through theirs.
   */
  async chooseLocation(b: { siteId?: string; driveId: string; folderName?: string }) {
    requireCapability('pmoa_admin');
    const { tenantId, userId } = this.ctx();
    const token = await this.accessToken('graph');

    // The folder is named after the workspace, so somebody browsing their own
    // SharePoint can tell whose documents these are without opening one.
    const [t] = await withTenant(tenantId, async (tx) => rows(await tx.execute(sql`
      SELECT name FROM tenants WHERE id = ${tenantId}`)));
    const drive = await call<any>(GRAPH, token, `/drives/${encodeURIComponent(b.driveId)}`);
    const site = b.siteId
      ? await call<any>(GRAPH, token, `/sites/${encodeURIComponent(b.siteId)}`).catch(() => null)
      : null;

    const folder = safeName(b.folderName || `The EPMO — ${t?.name ?? 'Workspace'}`);
    const root = await this.folder(token, b.driveId, 'root', folder);

    await withTenant(tenantId, async (tx) => {
      const [done] = rows(await tx.execute(sql`
        UPDATE integration_connections SET
          site_id = ${b.siteId ?? null}, site_name = ${site?.displayName ?? site?.name ?? null},
          site_url = ${site?.webUrl ?? null},
          drive_id = ${b.driveId}, drive_name = ${drive?.name ?? null},
          root_item_id = ${root.id}, root_path = ${folder},
          status = 'connected', last_error = NULL, updated_at = now()
        WHERE provider = ${PROVIDER} AND connected_by = ${userId} RETURNING id`));
      if (!done) throw new ConflictException('Microsoft is not connected to this workspace yet.');
      await this.audit(tx, PROVIDER, 'microsoft.location_set',
        { site: site?.webUrl ?? null, drive: drive?.name, folder });
    });
    return { driveId: b.driveId, rootItemId: root.id, folder, webUrl: root.webUrl };
  }

  /** Get a child folder by name, creating it if it is not there yet. */
  private async folder(token: string, driveId: string, parentId: string, name: string) {
    try {
      return await call<any>(GRAPH, token,
        `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}`
        + `:/${encodeURIComponent(name)}`);
    } catch (e) {
      if (!(e instanceof MsApiError) || e.status !== 404) throw e;
    }
    return call<any>(GRAPH, token,
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}/children`, {
        method: 'POST',
        // 'replace' would overwrite a folder somebody already had with that
        // name. 'fail' is caught above and re-read instead.
        body: JSON.stringify({ name, folder: {}, '@microsoft.graph.conflictBehavior': 'fail' }),
      });
  }

  private async connection(tx: any) {
    const { userId } = this.ctx();
    const [c] = rows(await tx.execute(sql`
      SELECT drive_id, root_item_id, root_path, site_url FROM integration_connections
      WHERE provider = ${PROVIDER} AND connected_by = ${userId}`));
    if (!c) throw new ConflictException('Microsoft is not connected to this workspace yet.');
    if (!c.drive_id || !c.root_item_id) {
      throw new ConflictException(
        'Microsoft is connected but no folder has been chosen yet. Pick a SharePoint library ' +
        'or OneDrive folder on the Integrations page.');
    }
    return c;
  }

  /* ── documents ────────────────────────────────────────────────────── */

  /**
   * Put a file in the customer's storage and record it as a document.
   *
   * Small files go in one PUT; anything over 4MB has to go through an upload
   * session, which is Graph's own limit rather than a choice. Either way the
   * bytes pass through this process and are not kept: the file exists in their
   * tenancy and in the request, nowhere else.
   */
  async upload(b: { projectId?: string; name: string; kind?: string; criterionId?: string },
                file: { buffer: Buffer; originalname: string; mimetype?: string }) {
    requireCapability('pmoa_manage_projects');
    const { tenantId, userId } = this.ctx();
    const token = await this.accessToken('graph');

    const c = await withTenant(tenantId, (tx) => this.connection(tx));

    // A folder per project, so a customer opening their SharePoint sees their
    // own structure rather than one flat heap of everyone's attachments.
    let parentId: string = c.root_item_id;
    let projectCode: string | null = null;
    if (b.projectId) {
      const [p] = await withTenant(tenantId, async (tx) => rows(await tx.execute(sql`
        SELECT code, name FROM projects WHERE id = ${b.projectId}`)));
      if (!p) throw new NotFoundException('No such project in this workspace.');
      projectCode = p.code;
      parentId = (await this.folder(token, c.drive_id, c.root_item_id,
        safeName(`${p.code} — ${p.name}`))).id;
    }

    const filename = safeName(file.originalname || b.name);
    const item = file.buffer.length <= 4 * 1024 * 1024
      ? await call<any>(GRAPH, token,
          `/drives/${encodeURIComponent(c.drive_id)}/items/${encodeURIComponent(parentId)}`
          + `:/${encodeURIComponent(filename)}:/content`
          // Microsoft keeps the previous version rather than losing it, so
          // re-uploading a drawing is a new version, not a second file.
          + '?@microsoft.graph.conflictBehavior=replace',
          { method: 'PUT', body: new Uint8Array(file.buffer),
            headers: { 'content-type': file.mimetype || 'application/octet-stream' } })
      : await this.uploadLarge(token, c.drive_id, parentId, filename, file.buffer);

    const doc = await withTenant(tenantId, async (tx) => {
      const [d] = rows(await tx.execute(sql`
        INSERT INTO documents (tenant_id, project_id, criterion_id, name, kind, version, status,
                               url, size_kb, owner_id, storage_provider,
                               external_drive_id, external_item_id, external_etag)
        VALUES (${tenantId}, ${b.projectId ?? null}, ${b.criterionId ?? null},
                ${b.name || filename}, ${b.kind || 'File'},
                ${String(item.cTag ? '1.0' : '1.0')}, 'draft',
                ${item.webUrl}, ${Math.max(1, Math.round((item.size ?? file.buffer.length) / 1024))},
                ${userId}, ${PROVIDER}, ${c.drive_id}, ${item.id}, ${item.eTag ?? null})
        RETURNING id, name, url`));
      await this.audit(tx, d.id, 'document.uploaded',
        { to: 'microsoft', project: projectCode, file: filename });
      return d;
    });
    return { id: doc.id, name: doc.name, webUrl: item.webUrl, itemId: item.id };
  }

  /** Graph's resumable upload, for anything over its 4MB single-shot limit. */
  private async uploadLarge(token: string, driveId: string, parentId: string,
                            filename: string, buf: Buffer) {
    const session = await call<any>(GRAPH, token,
      `/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(parentId)}`
      + `:/${encodeURIComponent(filename)}:/createUploadSession`,
      { method: 'POST', body: JSON.stringify({
          item: { '@microsoft.graph.conflictBehavior': 'replace' } }) });

    // A compromised or malformed uploadUrl must not receive customer file bytes.
    // Validate before sending the first chunk, and forbid redirect replay.
    const uploadUrl = microsoftUploadUrl(session?.uploadUrl);

    // Graph requires every chunk but the last to be a multiple of 320 KiB.
    const CHUNK = 320 * 1024 * 10;
    for (let start = 0; start < buf.length; start += CHUNK) {
      const end = Math.min(start + CHUNK, buf.length);
      const res = await fetch(uploadUrl, {
        method: 'PUT',
        redirect: 'error',
        headers: {
          'content-length': String(end - start),
          'content-range': `bytes ${start}-${end - 1}/${buf.length}`,
        },
        body: new Uint8Array(buf.subarray(start, end)),
      });
      if (!res.ok) {
        // Upload-session URLs are preauthenticated capabilities. Never reflect
        // arbitrary upstream error bodies (or buffer them) into API responses.
        await res.body?.cancel().catch(() => undefined);
        throw new MsApiError(res.status, 'uploadFailed',
          `Upload stopped at ${Math.round((start / buf.length) * 100)}% (HTTP ${res.status}).`);
      }
      if (end !== buf.length) {
        await res.body?.cancel().catch(() => undefined);
        if (res.status !== 202) {
          throw new MsApiError(502, 'uploadUnexpected',
            'Microsoft ended the upload before all chunks were sent.');
        }
        continue;
      }
      // The final chunk must return bounded completed-file metadata.
      if (res.status === 202) {
        await res.body?.cancel().catch(() => undefined);
        throw new MsApiError(502, 'uploadIncomplete', 'Microsoft did not confirm the final upload chunk.');
      }
      let item: unknown;
      try {
        item = await readBoundedMicrosoftJson(res, MAX_MICROSOFT_API_RESPONSE_BYTES);
      } catch {
        throw new MsApiError(502, 'uploadInvalid', 'Microsoft returned invalid or oversized completed upload metadata.');
      }
      if (!item || typeof item !== 'object' ||
          !('id' in item) || typeof item.id !== 'string' ||
          !('webUrl' in item) || typeof item.webUrl !== 'string') {
        throw new MsApiError(502, 'uploadInvalid', 'Microsoft returned an invalid completed upload.');
      }
      return item;
    }
    throw new MsApiError(500, 'uploadFailed', 'The upload finished without returning a file.');
  }

  /**
   * A short-lived link to open or download one document.
   *
   * Redirecting to the stored webUrl would work only for somebody already
   * signed in to their Microsoft tenant in that browser. This asks Graph for a
   * download URL that stands on its own, so a reviewer following a link from a
   * board pack gets the file rather than a sign-in page.
   */
  async documentLink(documentId: string): Promise<{ url: string; name: string }> {
    const { tenantId } = this.ctx();
    const [d] = await withTenant(tenantId, async (tx) => rows(await tx.execute(sql`
      SELECT name, external_drive_id, external_item_id, storage_provider, url
      FROM documents WHERE id = ${documentId}`)));
    if (!d) throw new NotFoundException('No such document in this workspace.');
    if (d.storage_provider !== PROVIDER || !d.external_item_id) {
      const safeUrl = safeDocumentRedirectUrl(d.url);
      if (!safeUrl) throw new NotFoundException('That document has no safe external link.');
      return { url: safeUrl, name: d.name };
    }
    const token = await this.accessToken('graph');
    const item = await call<any>(GRAPH, token,
      `/drives/${encodeURIComponent(d.external_drive_id)}/items/${encodeURIComponent(d.external_item_id)}`);
    const safeUrl = safeDocumentRedirectUrl(item['@microsoft.graph.downloadUrl'] ?? item.webUrl);
    if (!safeUrl) throw new NotFoundException('That document has no safe external link.');
    return { url: safeUrl, name: d.name };
  }

  /** What is in the workspace folder right now, straight from their storage. */
  async browse(projectId?: string) {
    const { tenantId } = this.ctx();
    const token = await this.accessToken('graph');
    const c = await withTenant(tenantId, (tx) => this.connection(tx));

    let parentId = c.root_item_id;
    if (projectId) {
      const [p] = await withTenant(tenantId, async (tx) => rows(await tx.execute(sql`
        SELECT code, name FROM projects WHERE id = ${projectId}`)));
      if (!p) throw new NotFoundException('No such project in this workspace.');
      try {
        parentId = (await call<any>(GRAPH, token,
          `/drives/${encodeURIComponent(c.drive_id)}/items/${encodeURIComponent(c.root_item_id)}`
          + `:/${encodeURIComponent(safeName(`${p.code} — ${p.name}`))}`)).id;
      } catch (e) {
        // Nothing has been filed for this project yet. That is an empty list,
        // not a failure.
        if (e instanceof MsApiError && e.status === 404) return { items: [] };
        throw e;
      }
    }
    const items = await callAll<any>(GRAPH, token,
      `/drives/${encodeURIComponent(c.drive_id)}/items/${encodeURIComponent(parentId)}/children`);
    return { items: items.map((i) => ({
      id: i.id, name: i.name, isFolder: Boolean(i.folder),
      sizeKb: i.size ? Math.round(i.size / 1024) : null,
      webUrl: i.webUrl, modifiedAt: i.lastModifiedDateTime,
      modifiedBy: i.lastModifiedBy?.user?.displayName ?? null,
    })) };
  }

  /* ── Power BI ─────────────────────────────────────────────────────── */

  /** Their workspaces and the reports in each, as that account can see them. */
  async reports() {
    // This is a workspace-level delegated Microsoft account, not a separate
    // identity for the current EPMO member. Listing reports can disclose its
    // entire accessible Power BI catalogue. Restrict it to workspace admins.
    requireCapability('pmoa_admin');
    // A workspace-wide delegated token is NOT per-user Microsoft authorization.
    // Fail closed by default until an independently reviewed provider-side design exists.
    if (process.env.MS_ALLOW_LEGACY_ADMIN_EMBED !== 'true') {
      throw new ServiceUnavailableException(
        'Power BI embedded bearer tokens are disabled pending per-user Microsoft authorization.');
    }
    const token = await this.accessToken('powerbi');
    const groups = await callAll<any>(POWERBI, token, '/groups', 200);
    const out: any[] = [];
    // "My workspace" is not in /groups and is reached by its own route.
    const personal = await call<any>(POWERBI, token, '/reports').catch(() => ({ value: [] }));
    for (const r of personal.value ?? []) {
      out.push({ id: r.id, name: r.name, groupId: null, groupName: 'My workspace',
                 embedUrl: r.embedUrl, webUrl: r.webUrl });
    }
    for (const g of groups) {
      const list = await call<any>(POWERBI, token, `/groups/${g.id}/reports`).catch(() => ({ value: [] }));
      for (const r of list.value ?? []) {
        out.push({ id: r.id, name: r.name, groupId: g.id, groupName: g.name,
                   embedUrl: r.embedUrl, webUrl: r.webUrl });
      }
    }
    return { reports: out };
  }

  /**
   * What the browser needs to render one report.
   *
   * The token belongs to the Microsoft account connected by a workspace
   * administrator, NOT to the current EPMO user. Sending it to a non-admin
   * would grant access to any reports that CONNECTED account can read,
   * regardless of the EPMO member's own Power BI access. Until per-user OAuth
   * tokens or a server-side scoped embedding design are implemented, this
   * functionality is restricted to workspace administrators.
   */
  async embed(reportId: string, groupId?: string) {
    // This endpoint returns a transferable Microsoft bearer access token.
    requireCapability('pmoa_admin');
    // A workspace-wide delegated token is NOT per-user Microsoft authorization.
    // Fail closed by default until an independently reviewed provider-side design exists.
    if (process.env.MS_ALLOW_LEGACY_ADMIN_EMBED !== 'true') {
      throw new ServiceUnavailableException(
        'Power BI embedded bearer tokens are disabled pending per-user Microsoft authorization.');
    }
    const token = await this.accessToken('powerbi');
    const path = groupId ? `/groups/${groupId}/reports/${reportId}` : `/reports/${reportId}`;
    const r = await call<any>(POWERBI, token, path);
    const { expiresAt } = this.tokens.get(`${this.ctx().tenantId}:${this.ctx().userId}:powerbi`) ?? { expiresAt: 0 };
    return {
      id: r.id, name: r.name, embedUrl: r.embedUrl, datasetId: r.datasetId,
      accessToken: token, tokenType: 'Aad' as const,
      expiresAt: new Date(expiresAt).toISOString(),
    };
  }
}
