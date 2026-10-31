import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeMicrosoftOAuthFailure } from '../apps/api/src/microsoft/oauth-error-policy.ts';

test('only the precise Microsoft invalid_grant consent code retains consent classification', () => {
  const consent = safeMicrosoftOAuthFailure({
    error: 'invalid_grant',
    error_description: 'AADSTS65001: The user has not consented. https://example.invalid/secret?token=private',
  });
  assert.deepEqual(consent, {
    code: 'invalid_grant',
    message: 'Microsoft requires additional permission for this resource.',
    consentRequired: true,
  });
  for (const description of [
    'consent required', 'user consent missing', 'AADSTS650010', 'xAADSTS65001',
    'invalid_grant: revoked refresh token',
  ]) {
    assert.equal(safeMicrosoftOAuthFailure({ error: 'invalid_grant', error_description: description }).consentRequired,
      false, description);
  }
  assert.equal(safeMicrosoftOAuthFailure({
    error: 'temporarily_unavailable', error_description: 'AADSTS65001',
  }).consentRequired, false);
});

test('OAuth error descriptions, provider codes, URLs and credentials never cross the exception boundary', () => {
  const secret = 'https://example.invalid/?access_token=super-secret';
  for (const value of [
    null, [], 'bad', {}, { error: secret, error_description: secret },
    { error: 'invalid_grant', error_description: secret },
    { error: 'invalid_grant', error_description: { secret } },
  ]) {
    const result = safeMicrosoftOAuthFailure(value);
    assert.ok(['invalid_grant', 'oauth_error'].includes(result.code));
    assert.doesNotMatch(JSON.stringify(result), /super-secret|example\.invalid|access_token/);
  }
});

test('token client uses reviewed OAuth failure classification instead of provider description', () => {
  const source = readFileSync(new URL('../apps/api/src/microsoft/client.ts', import.meta.url), 'utf8');
  const token = source.slice(source.indexOf('async function token('), source.indexOf('export const exchangeCode'));
  assert.match(token, /safeMicrosoftOAuthFailure\(j\)/);
  assert.match(token, /new MsAuthError\(failure\.code, failure\.message, failure\.consentRequired\)/);
  assert.doesNotMatch(token, /error\.error_description|error\.error\s*===\s*'string'/);
  const klass = source.slice(source.indexOf('export class MsAuthError'), source.indexOf('/** The claims we take'));
  assert.match(klass, /return this\.consentRequired;/);
  assert.doesNotMatch(klass, /consent\/i\.test\(this\.message\)/);
});
