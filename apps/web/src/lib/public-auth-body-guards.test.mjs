import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedBrowserJson } from './bounded-browser-json.mjs';
import { readBoundedBrowserForm } from './bounded-browser-form.mjs';

const url = 'https://theepmo.com/api/password-recovery/reset';
const jsonRequest = value => new Request(url, {
  method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify(value),
});

test('F37: ordinary reset and invitation JSON parses without changing payload', async () => {
  for (const payload of [
    { email: 'test@example.com', lang: 'ar' },
    { token: 't'.repeat(43), password: 'secret-12-chars' },
    { token: 't'.repeat(80), displayName: 'New user', password: '' },
  ]) {
    const result = await readBoundedBrowserJson(jsonRequest(payload));
    assert.deepEqual(result, { value: payload, error: null });
  }
});

test('F37: oversized streaming JSON cancels without accepting a partial token', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(16385)); },
    cancel() { cancelled = true; },
  });
  const result = await readBoundedBrowserJson({
    url, headers: new Headers({ 'content-type': 'application/json' }), body,
  });
  assert.deepEqual(result, { value: null, error: 'too-large' });
  assert.equal(cancelled, true);
});

test('F37: forged oversized content length fails before stream consumption', async () => {
  let read = false;
  const result = await readBoundedBrowserJson({
    url, headers: new Headers({
      'content-type': 'application/json', 'content-length': '16385',
    }),
    body: { getReader() { read = true; throw new Error('must not read'); } },
  });
  assert.equal(result.error, 'too-large');
  assert.equal(read, false);
});

test('F37: malformed, primitive, wrong media type and invalid UTF-8 fail closed', async () => {
  for (const value of ['null', '[]', '"text"', '{bad']) {
    const result = await readBoundedBrowserJson(new Request(url, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: value,
    }));
    assert.deepEqual(result, { value: null, error: 'invalid' });
  }
  const wrong = await readBoundedBrowserJson(new Request(url, {
    method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}',
  }));
  assert.equal(wrong.error, 'invalid');
  const invalidUtf8 = await readBoundedBrowserJson(new Request(url, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: new Uint8Array([0xff, 0xfe]),
  }));
  assert.equal(invalidUtf8.error, 'invalid');
});

test('F37: JSON exactly at byte ceiling is accepted, next byte is rejected', async () => {
  const exact = JSON.stringify({ value: 'a'.repeat(16384 - 12) });
  assert.equal(Buffer.byteLength(exact), 16384);
  assert.equal((await readBoundedBrowserJson(new Request(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: exact,
  }))).error, null);
  assert.equal((await readBoundedBrowserJson(new Request(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: exact + ' ',
  }))).error, 'too-large');
});

test('F37: sign-in parses a bounded form before sending credentials upstream', async () => {
  const request = new Request('https://theepmo.com/api/session', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'identifier=user%40example.com&password=correct-horse',
  });
  const parsed = await readBoundedBrowserForm(request, 16384);
  assert.equal(parsed.form.get('identifier'), 'user@example.com');
  assert.equal(parsed.form.get('password'), 'correct-horse');
  const source = readFileSync(new URL('../app/api/session/route.ts', import.meta.url), 'utf8');
  assert.match(source, /readBoundedBrowserForm\(req, 16384\)/);
  assert.match(source, /typeof identifierField !== 'string'/);
  assert.match(source, /typeof passwordField !== 'string'/);
  assert.doesNotMatch(source, /await req\.formData\(\)/);
  assert.ok(source.indexOf('readBoundedBrowserForm(req, 16384)') <
    source.indexOf('postLoginToApi(fetch,'));
});

test('F37: all three public JSON auth handlers enforce bounded complete reads', () => {
  for (const route of [
    'password-recovery/request', 'password-recovery/reset', 'invite/accept',
  ]) {
    const source = readFileSync(new URL('../app/api/' + route + '/route.ts', import.meta.url), 'utf8');
    assert.match(source, /rejectUnsafeBrowserMutation\(req\)/);
    assert.match(source, /readBoundedBrowserJson\(req\)/);
    assert.match(source, /status: parsed\.error === 'too-large' \? 413 : 400/);
    assert.doesNotMatch(source, /await req\.json\(\)/);
    assert.ok(source.indexOf('readBoundedBrowserJson(req)') <
      source.indexOf(route === 'invite/accept' ? 'fetch(' : 'postRecoveryToApi(fetch,'));
  }
});
