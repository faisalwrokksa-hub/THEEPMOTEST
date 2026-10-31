import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeMutationError, safeCreateIssues } from './safe-mutation-feedback.mjs';

test('upstream statuses map to fixed browser-safe messages', () => {
  for (const status of [400, 401, 403, 409, 422, 429, 500, 503]) {
    const message = safeMutationError(status);
    assert.equal(typeof message, 'string');
    assert.ok(message.length > 0 && message.length < 120);
    assert.doesNotMatch(message, /stack|SELECT|postgres|secret|token/i);
  }
  assert.match(safeMutationError(401), /session/i);
  assert.match(safeMutationError(503), /unavailable/i);
});

test('create issues preserve safe field focus without echoing upstream messages', () => {
  const secret = 'postgres://admin:secret@internal-db/workspace';
  const issues = safeCreateIssues({ issues: [
    { path: 'name', message: 'required ' + secret },
    { path: 'contactEmail', message: 'database error ' + secret },
    { path: 'name.secret', message: secret },
    { path: '__proto__', message: secret },
    { path: 'bad/path', message: secret },
    { path: 123, message: secret },
  ] });
  assert.deepEqual(issues, [
    { path: 'name', message: 'required' },
    { path: 'contactEmail', message: 'invalid' },
  ]);
  assert.doesNotMatch(JSON.stringify(issues), /secret|postgres|internal-db/);
});

test('malformed and oversized upstream issue lists are bounded', () => {
  assert.deepEqual(safeCreateIssues(null), []);
  assert.deepEqual(safeCreateIssues({ issues: 'not-an-array' }), []);
  assert.equal(safeCreateIssues({ issues: Array.from({ length: 1000 }, () => ({
    path: 'name', message: 'invalid',
  })) }).length, 20);
  assert.deepEqual(safeCreateIssues({ issues: [{ path: 'a'.repeat(65), message: 'bad' }] }), []);
});

test('both browser mutation routes never surface raw upstream error bodies', () => {
  const create = readFileSync(new URL('../app/api/create/route.ts', import.meta.url), 'utf8');
  const onboarding = readFileSync(new URL('../app/api/onboarding/route.ts', import.meta.url), 'utf8');
  for (const source of [create, onboarding]) {
    assert.match(source, /safeMutationError\(/);
    assert.doesNotMatch(source, /data\?\.message|j\?\.message/);
  }
  assert.match(create, /safeCreateIssues\(/);
  assert.doesNotMatch(create, /i\.message/);
  assert.doesNotMatch(onboarding, /result\?\.json\(\)/);
});
