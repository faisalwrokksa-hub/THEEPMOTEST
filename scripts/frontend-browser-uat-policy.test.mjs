import test from 'node:test';
import assert from 'node:assert/strict';
import { assertLocalUatOrigin, assertSyntheticUser, assertUatOutputDir, evidenceName, UAT_VARIANTS, PRIVATE_ROUTES } from './frontend-browser-uat-policy.mjs';

test('browser UAT is loopback-only and never silently tests live production', () => {
  assert.equal(assertLocalUatOrigin('http://127.0.0.1:3000'), 'http://127.0.0.1:3000');
  assert.equal(assertLocalUatOrigin('http://localhost:3000'), 'http://localhost:3000');
  for (const url of ['https://theepmo.com', 'https://staging.theepmo.com', 'http://10.0.0.1:3000', 'http://evil.com@localhost:3000', 'http://localhost:3000/?token=secret', 'http://localhost:3000/path']) {
    assert.throws(() => assertLocalUatOrigin(url), /loopback HTTP/);
  }
});

test('synthetic login cannot use ordinary customer email or username', () => {
  assert.equal(assertSyntheticUser('fatima@al-nakheel.test'), 'fatima@al-nakheel.test');
  for (const user of ['admin', 'real@theepmo.com', 'person@gmail.com', '', 'x@test.com']) {
    assert.throws(() => assertSyntheticUser(user), /synthetic/);
  }
});

test('evidence files stay in temp and use bounded fixed labels', () => {
  assert.match(assertUatOutputDir('/tmp/epmo-browser-uat'), /epmo-browser-uat$/);
  assert.throws(() => assertUatOutputDir('/home/runner/work/repo'), /temporary/);
  assert.equal(evidenceName('mobile-ar', '/getting-started'), 'mobile-ar-getting-started');
  assert.throws(() => evidenceName('mobile-ar', '/../secrets'), /Unsupported/);
});

test('covers 375px and desktop for both HTML directions and protects private routes', () => {
  assert.deepEqual(UAT_VARIANTS.map(v => `${v.width}:${v.lang}:${v.dir}`), ['375:en:ltr','375:ar:rtl','1440:en:ltr','1440:ar:rtl']);
  assert.ok(PRIVATE_ROUTES.has('/billing') && PRIVATE_ROUTES.has('/projects') && PRIVATE_ROUTES.has('/getting-started'));
});
