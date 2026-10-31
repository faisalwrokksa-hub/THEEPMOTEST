import test from 'node:test';
import assert from 'node:assert/strict';
import { consumeSecretFragmentOnce } from './secret-fragment.mjs';

test('StrictMode effect replay never erases the first captured bearer token', () => {
  const consumed = { current: false };
  let scrubbed = 0;
  const scrub = () => { scrubbed += 1; };
  const token = 'tenant-id.opaque-secret';
  assert.equal(consumeSecretFragmentOnce(consumed, '#token=' + encodeURIComponent(token), scrub), token);
  assert.equal(consumeSecretFragmentOnce(consumed, '', scrub), undefined);
  assert.equal(scrubbed, 1);
});

test('missing and URL-encoded fragments are scrubbed safely', () => {
  const missing = { current: false };
  let called = 0;
  assert.equal(consumeSecretFragmentOnce(missing, '', () => { called += 1; }), '');
  assert.equal(called, 1);
  const encoded = { current: false };
  assert.equal(consumeSecretFragmentOnce(encoded, '#token=ab%2Bcd&x=1', () => {}), 'ab+cd');
});
