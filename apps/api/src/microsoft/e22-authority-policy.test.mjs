import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { microsoftAuthority } from './authority-policy.ts';

test('default and tenant-specific Microsoft authorities use the trusted HTTPS token origin', () => {
  assert.equal(microsoftAuthority(undefined), 'https://login.microsoftonline.com/organizations');
  assert.equal(microsoftAuthority('https://login.microsoftonline.com/organizations/'),
    'https://login.microsoftonline.com/organizations');
  assert.equal(microsoftAuthority('https://LOGIN.MICROSOFTONLINE.COM/12345678-1234-1234-1234-123456789abc'),
    'https://login.microsoftonline.com/12345678-1234-1234-1234-123456789abc');
  assert.equal(microsoftAuthority('https://login.microsoftonline.com/contoso.onmicrosoft.com'),
    'https://login.microsoftonline.com/contoso.onmicrosoft.com');
});

test('OAuth client secret cannot be sent to a custom or disguised authority', () => {
  for (const authority of [
    '', 'http://login.microsoftonline.com/organizations',
    'https://evil.example/organizations',
    'https://login.microsoftonline.com.evil.example/organizations',
    'https://login.microsoftonline.com@evil.example/organizations',
    'https://evil.example@login.microsoftonline.com/organizations',
    'https://login.microsoftonline.com:444/organizations',
    'https://login.microsoftonline.com/organizations?next=https://evil.example',
    'https://login.microsoftonline.com/organizations#fragment',
    'https://login.microsoftonline.com/organizations/../../evil',
    'https://login.microsoftonline.com/organizations/oauth2/v2.0/token',
    'https://login.microsoftonline.com/organizations\\@evil.example',
    'https://login.microsoftonline.com/organizations\r\nX-Header: injected',
    'https://login.microsoftonline.com/..',
    'https://login.microsoftonline.com/a..b',
    'https://login.microsoftonline.us/organizations',
  ]) assert.throws(() => microsoftAuthority(authority), /Unsafe Microsoft OAuth authority/, authority);
});

test('both Microsoft authorize and token exchange use the validated authority', () => {
  const source = readFileSync(new URL('./client.ts', import.meta.url), 'utf8');
  assert.match(source, /const AUTHORITY = \(\) => microsoftAuthority\(process\.env\.MS_AUTHORITY\)/);
  assert.match(source, /new URL\(\x60\$\{AUTHORITY\(\)\}\/oauth2\/v2\.0\/authorize\x60\)/);
  assert.match(source, /fetch\(\x60\$\{AUTHORITY\(\)\}\/oauth2\/v2\.0\/token\x60/);
});
