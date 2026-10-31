/**
 * Browser-facing mutation feedback must never echo upstream exception text,
 * SQL errors, secrets, stack traces or attacker-controlled validation messages.
 * These fixed strings work with the existing English/Arabic UI.
 */
export function safeMutationError(status) {
  if (status === 401) return 'Your session has expired. Sign in again.';
  if (status === 403) return 'You do not have permission to perform this action.';
  if (status === 409) return 'This record conflicts with an existing record.';
  if (status === 429) return 'Too many attempts. Please try again shortly.';
  if (status >= 500 || !Number.isInteger(status)) return 'The service is temporarily unavailable. Please retry shortly.';
  return 'Please check your information and try again.';
}

/**
 * Retain only bounded field identifiers for client-side focus/validation.
 * Never copy an upstream issue message into a response or redirect URL.
 * @returns {{path: string, message: 'required' | 'invalid'}[]}
 */
export function safeCreateIssues(payload) {
  if (!Array.isArray(payload?.issues)) return [];
  const issues = [];
  for (const issue of payload.issues.slice(0, 20)) {
    if (!issue || typeof issue.path !== 'string' ||
        !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(issue.path)) continue;
    issues.push({
      path: issue.path,
      message: typeof issue.message === 'string' && /\brequired\b/i.test(issue.message)
        ? 'required' : 'invalid',
    });
  }
  return issues;
}
