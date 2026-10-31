import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:tls';
import { inspectPinnedCertificate, probeLoopbackTls, requestLoopback } from '../infra/staging/probe-loopback-tls.mjs';

const openssl = spawnSync('openssl', ['version'], { encoding: 'utf8' });
function certificate(san = 'DNS:staging.theepmo.com,DNS:api-staging.theepmo.com') {
  const dir = mkdtempSync(join(tmpdir(), 'epmo-s38-'));
  const cert = join(dir, 'cert.pem'), key = join(dir, 'key.pem');
  const result = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-days', '3', '-subj', '/CN=staging.theepmo.com', '-addext', `subjectAltName=${san}`,
    '-keyout', key, '-out', cert], { encoding: 'utf8', timeout: 15000 });
  if (result.status !== 0) throw new Error('OpenSSL fixture generation failed');
  return { cert, key, cleanup: () => rmSync(dir, { recursive: true, force: true }) };
}
async function server(f, route = host => host === 'app.theepmo.com' ? 421 : 200) {
  const srv = createServer({ cert: readFileSync(f.cert), key: readFileSync(f.key) }, socket => {
    socket.once('data', bytes => {
      const host = /^Host: (.+)$/im.exec(bytes.toString())?.[1]?.trim();
      const status = route(host);
      socket.end(`HTTP/1.1 ${status} Synthetic\r\nContent-Length: 0\r\nConnection: close\r\n\r\n`);
    });
  });
  await new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', resolve);
  });
  return { port: srv.address().port, close: () => new Promise(resolve => srv.close(resolve)) };
}

test('S38 actual loopback TLS: exact certificate, both vhosts and production Host rejection',
  { skip: openssl.status !== 0 }, async () => {
    const f = certificate(), s = await server(f, host =>
      host === 'app.theepmo.com' ? 421 : host === 'api-staging.theepmo.com' ? 404 : 302);
    try {
      const results = await probeLoopbackTls({ certFile: f.cert, port: s.port });
      assert.deepEqual(results.map(x => x.status), [302, 404, 421]);
    } finally { await s.close(); f.cleanup(); }
  });

test('S38 fail closed when the default vhost serves a production Host',
  { skip: openssl.status !== 0 }, async () => {
    const f = certificate(), s = await server(f, () => 200);
    try { await assert.rejects(probeLoopbackTls({ certFile: f.cert, port: s.port }), /routing failed/); }
    finally { await s.close(); f.cleanup(); }
  });

test('S38 fail closed when the peer certificate is not the pinned certificate',
  { skip: openssl.status !== 0 }, async () => {
    const f = certificate(), other = certificate(), s = await server(other);
    try { await assert.rejects(probeLoopbackTls({ certFile: f.cert, port: s.port }), /TLS handshake/); }
    finally { await s.close(); f.cleanup(); other.cleanup(); }
  });

test('S38 reject wildcard or extra certificate SANs before connecting',
  { skip: openssl.status !== 0 }, () => {
    for (const san of [
      'DNS:*.theepmo.com',
      'DNS:staging.theepmo.com,DNS:api-staging.theepmo.com,DNS:app.theepmo.com',
      'DNS:staging.theepmo.com',
    ]) {
      const f = certificate(san);
      try { assert.throws(() => inspectPinnedCertificate(f.cert), /exact staging DNS SANs/); }
      finally { f.cleanup(); }
    }
  });

test('S38 fail closed on timeout and disallow non-loopback SNI and privileged ports',
  { skip: openssl.status !== 0 }, async () => {
    const f = certificate(), s = await server(f, () => 200);
    try {
      const pinned = inspectPinnedCertificate(f.cert);
      await assert.rejects(requestLoopback({ port: s.port, pinned,
        servername: 'app.theepmo.com', hostHeader: 'app.theepmo.com' }), /staging SNIs/);
      await assert.rejects(requestLoopback({ port: 443, pinned,
        servername: 'staging.theepmo.com', hostHeader: 'staging.theepmo.com' }), /nonprivileged/);
      await assert.rejects(requestLoopback({ port: s.port, pinned,
        servername: 'staging.theepmo.com', hostHeader: 'staging.theepmo.com', timeoutMs: 50 }), /timeout/);
    } finally { await s.close(); f.cleanup(); }
  });

test('S38 a stalled local TLS HTTP response times out rather than accepting an incomplete probe',
  { skip: openssl.status !== 0 }, async () => {
    const f = certificate();
    const srv = createServer({ cert: readFileSync(f.cert), key: readFileSync(f.key) }, socket => {
      socket.once('data', () => { /* deliberately withhold HTTP response */ });
    });
    await new Promise(resolve => srv.listen(0, '127.0.0.1', resolve));
    try {
      const pinned = inspectPinnedCertificate(f.cert);
      await assert.rejects(requestLoopback({ port: srv.address().port, pinned,
        servername: 'staging.theepmo.com', hostHeader: 'staging.theepmo.com', timeoutMs: 150 }), /TLS handshake/);
    } finally { srv.closeAllConnections?.(); await new Promise(resolve => srv.close(resolve)); f.cleanup(); }
  });
