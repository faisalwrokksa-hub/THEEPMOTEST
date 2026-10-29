import type { Connection } from './microsoft.service';

/** Non-admins need only to know whether the workspace is connected.
 * Microsoft account metadata, provider errors and consent scopes are private
 * administrator information; never expose them via a read-only status call. */
export function redactMicrosoftConnection(connection: Connection, isAdministrator: boolean): Connection {
  if (isAdministrator) return connection;
  return {
    id: '', status: connection.status,
    accountEmail: null, accountName: null, externalTenantId: null, scopes: null,
    siteId: null, siteName: null, siteUrl: null, driveId: null, driveName: null,
    rootItemId: null, rootPath: null,
    connectedAt: connection.connectedAt, lastError: null,
  };
}
