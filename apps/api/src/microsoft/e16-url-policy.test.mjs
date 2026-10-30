import test from 'node:test';
import assert from 'node:assert/strict';
import { microsoftApiUrl } from './url-policy.ts';

const graph = 'https://graph.microsoft.com/v1.0';
const powerbi = 'https://api.powerbi.com/v1.0/myorg';

test('relative and absolute Microsoft API pages retain exact approved service boundaries', () => {
  assert.equal(microsoftApiUrl(graph, '/me/drive'),
    'https://graph.microsoft.com/v1.0/me/drive');
  assert.equal(microsoftApiUrl(graph, '/sites?search=engineering'),
    'https://graph.microsoft.com/v1.0/sites?search=engineering');
  assert.equal(microsoftApiUrl(graph, 'https://graph.microsoft.com/v1.0/me/drive?$top=200'),
    'https://graph.microsoft.com/v1.0/me/drive?$top=200');
  assert.equal(microsoftApiUrl(powerbi, '/groups'),
    'https://api.powerbi.com/v1.0/myorg/groups');
});

test('delegated bearer token cannot be redirected by malicious OData nextLink', () => {
  for (const path of [
    'https://attacker.example/collect',
    'http://graph.microsoft.com/v1.0/me',
    'https://graph.microsoft.com.evil.example/v1.0/me',
    'https://graph.microsoft.com@attacker.example/v1.0/me',
    'https://graph.microsoft.com:444/v1.0/me',
    'https://graph.microsoft.com/v1.0evil/me',
    'https://graph.microsoft.com/beta/me',
    'https://api.powerbi.com/v1.0/myorg/groups',
    '//attacker.example/collect',
    '/../../attacker',
    '/\\\\attacker.example/collect',
    '/me/drive#token',
    '/me/drive\r\nX-Injected: yes',
  ]) {
    assert.throws(() => microsoftApiUrl(graph, path), undefined, path);
  }
});

test('invalid base service never receives bearer credentials', () => {
  for (const base of [
    'http://graph.microsoft.com/v1.0',
    'https://graph.microsoft.com:444/v1.0',
    'https://user:pass@graph.microsoft.com/v1.0',
  ]) assert.throws(() => microsoftApiUrl(base, '/me'));
});
