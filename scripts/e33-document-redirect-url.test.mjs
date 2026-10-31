import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { safeDocumentRedirectUrl } from '../apps/api/src/microsoft/document-redirect-policy.ts';

test('valid external document and signed Microsoft URLs remain unchanged', () => {
  for (const url of [
    'https://contoso.sharepoint.com/sites/docs/file.pdf',
    'https://download.example.com/path?token=a%2Fb&expiry=123',
    'http://legacy.example.com/document.pdf',
  ]) assert.equal(safeDocumentRedirectUrl(url), url);
});

test('unsafe browser redirect schemes and authority disguises fail closed', () => {
  for (const value of [
    null, undefined, 12, '', ' ', '/local/path', '//evil.example/file',
    'javascript:alert(1)', 'data:text/html,hello', 'file:///etc/passwd',
    'https://user:password@example.com/file',
    'https://example.com\\@evil.example/file',
    'https://example.com/\r\nLocation: https://evil.example',
    'https://example.com/file\n', ' https://example.com/file',
    'https://', 'http:/',
  ]) assert.equal(safeDocumentRedirectUrl(value), null, String(value));
});

test('both legacy stored links and Microsoft metadata are validated before redirect', () => {
  const source = readFileSync(new URL('../apps/api/src/microsoft/microsoft.service.ts', import.meta.url), 'utf8');
  const fn = source.slice(source.indexOf('async documentLink('), source.indexOf('async browse('));
  assert.match(source, /import \{ safeDocumentRedirectUrl \} from '\.\/document-redirect-policy';/);
  assert.match(fn, /safeDocumentRedirectUrl\(d\.url\)/);
  assert.match(fn, /safeDocumentRedirectUrl\(item\['@microsoft\.graph\.downloadUrl'\] \?\? item\.webUrl\)/);
  assert.match(fn, /if \(!safeUrl\) throw new NotFoundException/);
});
