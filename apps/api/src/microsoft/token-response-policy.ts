/**
 * The OAuth token endpoint is trusted only to supply a well-formed bearer
 * credential. Do not cache or persist malformed/empty responses as tokens.
 * Microsoft sometimes represents expires_in as a decimal string.
 */
export type MicrosoftTokenPayload = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string;
  idToken: string | null;
};

export function parseMicrosoftTokenPayload(value: unknown, now = Date.now()): MicrosoftTokenPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Invalid Microsoft token response');
  }
  const j = value as Record<string, unknown>;
  const ttl = typeof j.expires_in === 'number'
    ? j.expires_in
    : typeof j.expires_in === 'string' && /^\d+$/.test(j.expires_in)
      ? Number(j.expires_in)
      : NaN;
  if (typeof j.access_token !== 'string' || !j.access_token.trim() ||
      (j.token_type !== undefined && (typeof j.token_type !== 'string' ||
        j.token_type.toLowerCase() !== 'bearer')) ||
      !Number.isFinite(ttl) || ttl <= 0 || ttl > 86_400 ||
      !Number.isFinite(now) ||
      (j.refresh_token !== undefined && j.refresh_token !== null &&
        (typeof j.refresh_token !== 'string' || !j.refresh_token.trim())) ||
      (j.id_token !== undefined && j.id_token !== null && typeof j.id_token !== 'string') ||
      (j.scope !== undefined && typeof j.scope !== 'string')) {
    throw new Error('Invalid Microsoft token response');
  }
  return {
    accessToken: j.access_token,
    refreshToken: (j.refresh_token as string | null | undefined) ?? null,
    expiresAt: now + ttl * 1000,
    scope: (j.scope as string | undefined) ?? '',
    idToken: (j.id_token as string | null | undefined) ?? null,
  };
}
