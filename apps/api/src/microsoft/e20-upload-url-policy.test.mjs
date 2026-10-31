import test from 'node:test';
import assert from 'node:assert/strict';
import { microsoftUploadUrl } from './url-policy.ts';

test('Microsoft-hosted SharePoint and OneDrive upload sessions retain opaque query', () => {
  for (const url of [
    'https://contoso.sharepoint.com/sites/a/_api/v2.0/drive/uploadSession?token=opaque',
    'https://contoso-my.sharepoint.com/personal/a/_api/v2.0/drive/uploadSession?x=1',
    'https://sn3302.up.1drv.com/up/123?authkey=opaque',
    'https://contoso.sharepoint-df.com/uploadSession?x=1',
  ]) assert.equal(microsoftUploadUrl(url), url);
});

test('upload session rejects arbitrary hosts, private-network SSRF, protocol and redirect tricks', () => {
  for (const url of [
    undefined, null, '', '/upload', 'http://contoso.sharepoint.com/upload',
    'https://127.0.0.1/upload', 'https://localhost/upload',
    'https://169.254.169.254/latest/meta-data/',
    'https://evil.example/upload', 'https://sharepoint.com.evil.example/upload',
    'https://sharepoint.com/upload', 'https://1drv.com/upload',
    'https://attacker.up.1drv.com.evil.example/upload',
    'https://user:pass@contoso.sharepoint.com/upload',
    'https://contoso.sharepoint.com:8443/upload',
    'https://contoso.sharepoint.com/upload#fragment',
    'https://contoso.sharepoint.com/upload\\\\evil',
    'https://contoso.sharepoint.com/upload\r\nX-Injected: yes',
  ]) assert.throws(() => microsoftUploadUrl(url), /Unsafe/, String(url));
});
