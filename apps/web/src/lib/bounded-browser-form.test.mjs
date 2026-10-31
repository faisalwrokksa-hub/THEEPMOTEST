import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBoundedBrowserForm } from './bounded-browser-form.mjs';

const url = 'https://theepmo.com/api/create';

test('normal multipart and URL-encoded customer forms survive bounded parsing', async () => {
  const fields = new FormData();
  fields.set('__kind', 'project');
  fields.set('name', 'Programme launch');
  const multipart = await readBoundedBrowserForm(new Request(url, {
    method: 'POST', body: fields,
  }));
  assert.equal(multipart.error, null);
  assert.equal(multipart.form.get('__kind'), 'project');
  assert.equal(multipart.form.get('name'), 'Programme launch');

  const encoded = await readBoundedBrowserForm(new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'action=invite&email=test%40example.com',
  }));
  assert.equal(encoded.form.get('email'), 'test@example.com');
});

test('oversized streaming bodies are rejected and cancelled before formData parsing', async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) { controller.enqueue(new Uint8Array(131073)); },
    cancel() { cancelled = true; },
  });
  const result = await readBoundedBrowserForm({
    url, headers: new Headers({ 'content-type': 'application/x-www-form-urlencoded' }), body,
  });
  assert.equal(result.form, null);
  assert.equal(result.error, 'too-large');
  assert.equal(cancelled, true);
});

test('forged oversized content length is rejected without consuming the body', async () => {
  let consumed = false;
  const body = new ReadableStream({
    pull() { consumed = true; },
  });
  const result = await readBoundedBrowserForm({
    url, headers: new Headers({
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': '131073',
    }), body,
  });
  assert.equal(result.error, 'too-large');
  assert.equal(consumed, false);
});

test('malformed content types and multipart bodies fail closed', async () => {
  const json = new Request(url, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
  });
  assert.equal((await readBoundedBrowserForm(json)).error, 'invalid');
  const malformed = new Request(url, {
    method: 'POST',
    headers: { 'content-type': 'multipart/form-data; boundary=not-found' },
    body: 'not multipart data',
  });
  assert.equal((await readBoundedBrowserForm(malformed)).error, 'invalid');
  assert.equal((await readBoundedBrowserForm(null)).error, 'invalid');
});

test('both authenticated form handlers parse only bounded browser bodies', () => {
  for (const route of ['create', 'onboarding']) {
    const source = readFileSync(new URL(`../app/api/${route}/route.ts`, import.meta.url), 'utf8');
    assert.match(source, /readBoundedBrowserForm\(req\)/);
    assert.doesNotMatch(source, /await req\.formData\(\)/);
    assert.match(source, /status: parsed\.error === 'too-large' \? 413 : 400/);
  }
});
