import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeApiFailure } from './safe-api-error.mjs';

test('upstream exception bodies never enter an authenticated API error', () => {
  const secret = 'postgres://admin:secret@internal-db/customer';
  for (const status of [400, 401, 403, 404, 409, 429, 500, 503]) {
    const failure = safeApiFailure(status, `SQL SELECT token=${secret}`);
    assert.equal(failure.status, status);
    assert.doesNotMatch(JSON.stringify(failure), /postgres|secret|internal-db|SELECT|token/);
    assert.equal(failure.detail, '');
  }
});

test('license-specific 403 classification remains available without raw messages', () => {
  const secret = 'customer-email@example.com bearer SECRET';
  for (const phrase of ['not enabled for this workspace', 'subscription expired']) {
    const failure = safeApiFailure(403, `{"message":"${phrase}: ${secret}"}`);
    assert.equal(failure.detail, phrase);
    assert.doesNotMatch(JSON.stringify(failure), /customer-email|bearer|SECRET/);
  }
  assert.equal(safeApiFailure(500, 'subscription expired').detail, '');
});

test('malformed statuses and bodies fail closed', () => {
  assert.deepEqual(safeApiFailure(NaN, null), { status: 503, message: 'API request failed (503)', detail: '' });
  assert.deepEqual(safeApiFailure(302, 'subscription expired'), { status: 503, message: 'API request failed (503)', detail: '' });
  assert.equal(safeApiFailure(403, { message: 'subscription expired' }).detail, '');
});

test('authenticated API helper never copies raw upstream text into ApiError', () => {
  const source = readFileSync(new URL('./api.ts', import.meta.url), 'utf8');
  assert.match(source, /safeApiFailure\(res\.status, licenseBody\)/);
  assert.match(source, /res\.status === 403 \? await res\.text\(\)/);
  assert.doesNotMatch(source, /JSON\.parse\(body\)\?\.message/);
  assert.doesNotMatch(source, /String\(detail\)\.slice/);
});
