/** E44 dormant per-user delegated credential store, NOT wired to API routes.
 * Every operation sets both RLS contexts transaction-locally. The restrictive
 * database policy requires an active administrator membership. Future callers
 * must use trusted session/OAuth state identities, never request body fields.
 * Legacy workspace connections are never copied or modified here.
 */
import { sql } from 'drizzle-orm';
import { withTenant } from '@pmo/db';
import { seal } from './crypto';
import { assertMicrosoftUserIdentity, microsoftUserStorePreviewEnabled } from './user-connection-policy';

type TenantTx = Parameters<Parameters<typeof withTenant>[1]>[0];
const rows = (r: unknown) => r as unknown as any[];

export type UserMicrosoftConnection = {
  id: string; status: string; sealedRefreshToken: string | null;
  accountEmail: string | null; accountName: string | null;
  externalTenantId: string | null; scopes: string | null;
  siteId: string | null; driveId: string | null; rootItemId: string | null;
};
export type UserMicrosoftConsent = {
  refreshToken: string; accountEmail: string | null; accountName: string | null;
  externalTenantId: string | null; scopes: string | null;
};

async function withOwner<T>(
  tenantId: string, userId: string, fn: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  if (!microsoftUserStorePreviewEnabled())
    throw new Error('Per-user Microsoft connection storage is not enabled.');
  assertMicrosoftUserIdentity(tenantId, userId);
  return withTenant(tenantId, async (tx) => {
    await tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
    return fn(tx);
  });
}

/** Internal-only: ciphertext must never enter a controller response. */
export async function readUserMicrosoftConnection(
  tenantId: string, userId: string,
): Promise<UserMicrosoftConnection | null> {
  return withOwner(tenantId, userId, async (tx) => {
    const [row] = rows(await tx.execute(sql`
      SELECT id, status, refresh_token, account_email, account_name,
             external_tenant_id, scopes, site_id, drive_id, root_item_id
      FROM microsoft_user_connections
      WHERE tenant_id = ${tenantId} AND user_id = ${userId} AND provider = 'microsoft'`));
    return row ? {
      id: row.id, status: row.status, sealedRefreshToken: row.refresh_token,
      accountEmail: row.account_email, accountName: row.account_name,
      externalTenantId: row.external_tenant_id, scopes: row.scopes,
      siteId: row.site_id, driveId: row.drive_id, rootItemId: row.root_item_id,
    } : null;
  });
}

/** Upsert only the consenting active workspace administrator's own row. */
export async function saveUserMicrosoftConsent(
  tenantId: string, userId: string, consent: UserMicrosoftConsent,
): Promise<string> {
  return withOwner(tenantId, userId, async (tx) => {
    const [member] = rows(await tx.execute(sql`
      SELECT m.id FROM memberships AS m
      JOIN users AS u ON u.id = m.user_id
      WHERE m.tenant_id = ${tenantId} AND m.user_id = ${userId}
        AND m.is_active = true AND u.is_active = true
        AND m.role IN ('owner', 'admin', 'client_admin')
      FOR SHARE OF m, u`));
    if (!member) throw new Error('The consenting Microsoft user is not an active workspace administrator.');
    const sealed = seal(consent.refreshToken);
    const [saved] = rows(await tx.execute(sql`
      INSERT INTO microsoft_user_connections
        (tenant_id, user_id, provider, status, refresh_token,
         account_email, account_name, external_tenant_id, scopes,
         connected_at, last_error, updated_at)
      VALUES (${tenantId}, ${userId}, 'microsoft', 'connected', ${sealed},
              ${consent.accountEmail}, ${consent.accountName},
              ${consent.externalTenantId}, ${consent.scopes}, now(), NULL, now())
      ON CONFLICT (tenant_id, user_id, provider) DO UPDATE SET
        status = 'connected', refresh_token = EXCLUDED.refresh_token,
        account_email = EXCLUDED.account_email,
        account_name = EXCLUDED.account_name,
        external_tenant_id = EXCLUDED.external_tenant_id,
        scopes = (
          SELECT string_agg(DISTINCT s, ' ')
          FROM unnest(string_to_array(
            coalesce(microsoft_user_connections.scopes, '') || ' ' ||
            coalesce(EXCLUDED.scopes, ''), ' ')) AS s
          WHERE s <> ''),
        last_error = NULL, updated_at = now()
      RETURNING id`));
    if (!saved) throw new Error('Microsoft consent could not be stored for this user.');
    return saved.id as string;
  });
}

/** Compare-and-swap rotation cannot revive disconnected/revoked credentials. */
export async function rotateUserMicrosoftCredential(
  tenantId: string, userId: string, expectedSealedToken: string,
  newRefreshToken: string | null,
): Promise<string | null> {
  return withOwner(tenantId, userId, async (tx) => {
    const replacement = newRefreshToken ? seal(newRefreshToken) : expectedSealedToken;
    const [row] = rows(await tx.execute(sql`
      UPDATE microsoft_user_connections
      SET refresh_token = ${replacement}, last_used_at = now(), updated_at = now()
      WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        AND provider = 'microsoft' AND status = 'connected'
        AND refresh_token = ${expectedSealedToken}
      RETURNING id`));
    return row ? replacement : null;
  });
}

/** A provider-confirmed revoked credential loses its persisted secret. */
export async function markUserMicrosoftCredentialRevoked(
  tenantId: string, userId: string, expectedSealedToken: string,
): Promise<boolean> {
  return withOwner(tenantId, userId, async (tx) => {
    const gone = rows(await tx.execute(sql`
      UPDATE microsoft_user_connections
      SET status = 'error', refresh_token = NULL,
          last_error = 'Microsoft credentials are invalid. Reconnect.',
          updated_at = now()
      WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        AND provider = 'microsoft' AND status = 'connected'
        AND refresh_token = ${expectedSealedToken}
      RETURNING id`));
    return gone.length === 1;
  });
}

/** Owner-specific disconnect, never another user's row. */
export async function deleteUserMicrosoftConnection(
  tenantId: string, userId: string,
): Promise<boolean> {
  return withOwner(tenantId, userId, async (tx) => {
    const gone = rows(await tx.execute(sql`
      DELETE FROM microsoft_user_connections
      WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        AND provider = 'microsoft'
      RETURNING id`));
    return gone.length === 1;
  });
}

/** Folder selection is guarded against concurrent revocation/disconnect. */
export async function setUserMicrosoftLocation(
  tenantId: string, userId: string,
  location: { siteId: string | null; driveId: string; rootItemId: string; rootPath: string | null },
): Promise<boolean> {
  return withOwner(tenantId, userId, async (tx) => {
    const saved = rows(await tx.execute(sql`
      UPDATE microsoft_user_connections
      SET site_id = ${location.siteId}, drive_id = ${location.driveId},
          root_item_id = ${location.rootItemId}, root_path = ${location.rootPath},
          updated_at = now()
      WHERE tenant_id = ${tenantId} AND user_id = ${userId}
        AND provider = 'microsoft' AND status = 'connected'
        AND refresh_token IS NOT NULL
      RETURNING id`));
    return saved.length === 1;
  });
}
