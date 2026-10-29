import { randomBytes, createHash } from 'node:crypto';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const opaque = /^[A-Za-z0-9_-]{43}$/;
/** Tokens contain the tenant UUID only to select its RLS scope; the secret is 256 random bits. */
export function makeInvitationToken(tenantId: string) {
  if (!uuid.test(tenantId)) throw new Error('Invalid tenant identifier');
  const secret = randomBytes(32).toString('base64url');
  return { token: `${tenantId}.${secret}`, hash: hashInvitationSecret(secret) };
}
export function parseInvitationToken(value: unknown): { tenantId: string; hash: string } | null {
  if (typeof value !== 'string' || value.length > 100) return null;
  const pieces = value.split('.');
  if (pieces.length !== 2 || !uuid.test(pieces[0]) || !opaque.test(pieces[1])) return null;
  return { tenantId: pieces[0].toLowerCase(), hash: hashInvitationSecret(pieces[1]) };
}
export function hashInvitationSecret(secret: string): string {
  return createHash('sha256').update(secret, 'utf8').digest('hex');
}
export type InvitationState = { deliveryStatus: string; expiresAt: string | Date; consumedAt?: string | Date | null; revokedAt?: string | Date | null };
export function isInvitationAcceptable(invite: InvitationState, now = new Date()): boolean {
  return invite.deliveryStatus === 'sent' && !invite.consumedAt && !invite.revokedAt &&
    Number.isFinite(new Date(invite.expiresAt).getTime()) && new Date(invite.expiresAt).getTime() > now.getTime();
}
export function invitationLink(webOrigin: string, token: string): string {
  const u = new URL('/accept-invite', webOrigin);
  if (u.protocol !== 'https:' && !(['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol === 'http:'))
    throw new Error('Invitation destination must use HTTPS');
  // Fragment is not transmitted to the web server, reducing token leakage in access logs.
  u.hash = `token=${encodeURIComponent(token)}`;
  return u.toString();
}
