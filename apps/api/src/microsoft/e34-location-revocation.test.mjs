import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('./microsoft.service.ts', import.meta.url), 'utf8');
const location = source.slice(source.indexOf('async chooseLocation('), source.indexOf('/** Get a child folder', source.indexOf('async chooseLocation(')));
const connection = source.slice(source.indexOf('private async connection('), source.indexOf('/* ── documents', source.indexOf('private async connection(')));

test('location selection cannot revive an errored or revoked delegated connection', () => {
  assert.match(location, /UPDATE integration_connections SET[\s\S]*?WHERE provider = \$\{PROVIDER\} AND connected_by = \$\{userId\}\s+AND status = 'connected' RETURNING id/);
  const update = location.slice(location.indexOf('UPDATE integration_connections SET'), location.indexOf('WHERE provider = ${PROVIDER}', location.indexOf('UPDATE integration_connections SET')));
  assert.doesNotMatch(update, /status\s*=\s*'connected'/);
  assert.doesNotMatch(update, /last_error\s*=\s*NULL/);
});

test('document storage location cannot be loaded from an inactive connection', () => {
  assert.match(connection, /WHERE provider = \$\{PROVIDER\} AND connected_by = \$\{userId\}\s+AND status = 'connected'/);
});
