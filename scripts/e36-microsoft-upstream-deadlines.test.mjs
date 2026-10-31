import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const client = readFileSync(new URL('../apps/api/src/microsoft/client.ts', import.meta.url), 'utf8');
const service = readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');

test('OAuth client-secret exchange has a finite deadline and forbids redirects', () => {
  const start = client.indexOf('async function token(');
  const end = client.indexOf('export const exchangeCode', start);
  const body = client.slice(start, end);
  assert.match(body, /fetch\(\x60\$\{AUTHORITY\(\)\}\/oauth2\/v2\.0\/token\x60,\s*\{/);
  assert.match(body, /signal:\s*AbortSignal\.timeout\(15_000\)/);
  assert.match(body, /redirect:\s*'error'/);
});

test('Graph and Power BI bearer requests have a finite deadline and forbid redirects', () => {
  const start = client.indexOf('export async function call<');
  const end = client.indexOf('export async function callAll<', start);
  const body = client.slice(start, end);
  assert.match(body, /signal:\s*AbortSignal\.timeout\(30_000\)/);
  assert.match(body, /redirect:\s*'error'/);
});

test('preauthenticated Microsoft upload chunks have a finite deadline and forbid redirects', () => {
  const start = service.indexOf('private async uploadLarge(');
  const end = service.indexOf('async documentLink(', start);
  const body = service.slice(start, end);
  assert.match(body, /fetch\(uploadUrl,\s*\{/);
  assert.match(body, /signal:\s*AbortSignal\.timeout\(60_000\)/);
  assert.match(body, /redirect:\s*'error'/);
});
