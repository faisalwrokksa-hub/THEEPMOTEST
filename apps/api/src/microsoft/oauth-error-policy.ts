/**
 * OAuth token failures are untrusted even when returned by the configured
 * Microsoft endpoint. Never retain error_description or arbitrary error codes
 * in exceptions: they can contain signed URLs, tokens, or tenant information.
 * Only the documented AADSTS65001 signal is needed to distinguish missing
 * resource consent from a revoked refresh token.
 */
export type SafeMicrosoftOAuthFailure = {
  code: 'invalid_grant' | 'oauth_error';
  message: string;
  consentRequired: boolean;
};

export function safeMicrosoftOAuthFailure(value: unknown): SafeMicrosoftOAuthFailure {
  const error = value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : {};
  const invalidGrant = error.error === 'invalid_grant';
  const description = typeof error.error_description === 'string'
    ? error.error_description : '';
  const consentRequired = invalidGrant && /(?:^|[^A-Za-z0-9])AADSTS65001(?![0-9])/i.test(description);
  return {
    code: invalidGrant ? 'invalid_grant' : 'oauth_error',
    message: consentRequired
      ? 'Microsoft requires additional permission for this resource.'
      : 'Microsoft authorization failed.',
    consentRequired,
  };
}
