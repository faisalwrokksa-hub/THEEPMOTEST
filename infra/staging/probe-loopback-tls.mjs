#!/usr/bin/env node
/**
 * S38: synthetic-only, read-only HTTPS ingress probe bound to the local loopback.
 * Checks exact staging SANs, pinned leaf certificate, both vhosts and unknown
 * Host rejection. Never resolves DNS, follows redirects, changes DNS, or deploys.
 * A local PASS is NOT public HTTPS or production/staging acceptance evidence.
 */
import { X509Certificate, createHash } from 'node:crypto';
import { lstatSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { connect as tlsConnect } from 'node:tls';

const HOSTS = Object.freeze(['staging.theepmo.com', 'api-staging.theepmo.com']);
const FORBIDDEN_HOST = 'app.theepmo.com';
const MAX_RESPONSE = 32 * 1024;
const CERT_LIMIT = 128 * 1024;
const STATUS = /^HTTP\/1\.[01] ([1-5][0-9]{2})(?:[ \r\n]|$)/;

function exactSans(cert) {
  const names = (cert.subjectAltName || '').split(/,\s*/).filter(Boolean);
  return names.length === HOSTS.length && HOSTS.every(host => names.includes('DNS:' + host));
}

export function inspectPinnedCertificate(path, now = Date.now()) {
  if (!isAbsolute(path)) throw new Error('Absolute certificate path required');
  const st = lstatSync(path);
  if (!st.isFile() || st.size > CERT_LIMIT || st.size === 0)
    throw new Error('Certificate must be a bounded regular file, not a symlink');
  const pem = readFileSync(path);
  const cert = new X509Certificate(pem);
  if (!exactSans(cert) || HOSTS.some(host => cert.checkHost(host) !== host))
    throw new Error('Certificate must have only the two exact staging DNS SANs');
  if (Date.parse(cert.validFrom) > now || Date.parse(cert.validTo) < now + 24 * 60 * 60 * 1000)
    throw new Error('Certificate is expired, not yet valid or expires within 24 hours');
  return { pem, fingerprint: createHash('sha256').update(cert.raw).digest('hex') };
}

function checkPort(port) {
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('Only an explicitly chosen nonprivileged local TLS port is allowed');
}

/**
 * Injection allows deterministic, network-free unit tests. CLI always uses
 * node:tls to connect to literal 127.0.0.1, never an external hostname.
 */
export async function requestLoopback({ port, servername, hostHeader, pinned, timeoutMs = 4000, connect = tlsConnect }) {
  checkPort(port);
  if (!HOSTS.includes(servername) || ![...HOSTS, FORBIDDEN_HOST].includes(hostHeader))
    throw new Error('Only the two staging SNIs and one negative production Host test are allowed');
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 10_000)
    throw new Error('Invalid bounded TLS timeout');
  return await new Promise((done, fail) => {
    let finished = false, raw = Buffer.alloc(0);
    const settle = (err, code, socket) => {
      if (finished) return;
      finished = true;
      if (socket) socket.destroy();
      if (err) fail(new Error('Local TLS handshake, response or pinned certificate failed'));
      else done(code);
    };
    let socket;
    try {
      socket = connect({ host: '127.0.0.1', port, servername,
        ca: pinned.pem, rejectUnauthorized: true, minVersion: 'TLSv1.2' });
    } catch { settle(true); return; }
    socket.setTimeout(timeoutMs, () => settle(true, undefined, socket));
    socket.on('error', () => settle(true, undefined, socket));
    socket.on('secureConnect', () => {
      try {
        const peer = socket.getPeerCertificate(true);
        if (!socket.authorized || !peer?.raw ||
          createHash('sha256').update(peer.raw).digest('hex') !== pinned.fingerprint ||
          !exactSans(new X509Certificate(peer.raw))) throw new Error('TLS identity mismatch');
        // Never send cookies, auth headers, secrets, or mutate the application.
        socket.write(`GET / HTTP/1.1\r\nHost: ${hostHeader}\r\nConnection: close\r\n\r\n`);
      } catch { settle(true, undefined, socket); }
    });
    socket.on('data', chunk => {
      raw = Buffer.concat([raw, chunk]);
      if (raw.length > MAX_RESPONSE) { settle(true, undefined, socket); return; }
      const end = raw.indexOf('\r\n\r\n');
      if (end < 0) return;
      const line = raw.subarray(0, raw.indexOf('\r\n')).toString('ascii');
      const match = STATUS.exec(line);
      if (!match) { settle(true, undefined, socket); return; }
      settle(false, Number(match[1]), socket);
    });
    socket.on('end', () => settle(true, undefined, socket));
  });
}

export async function probeLoopbackTls({ certFile, port = 8443, timeoutMs = 4000, connect } = {}) {
  checkPort(port);
  const pinned = inspectPinnedCertificate(certFile);
  const requests = [
    { servername: HOSTS[0], hostHeader: HOSTS[0], expected: 'staging-web' },
    { servername: HOSTS[1], hostHeader: HOSTS[1], expected: 'staging-api' },
    { servername: HOSTS[0], hostHeader: FORBIDDEN_HOST, expected: 'unknown-host-rejection' },
  ];
  const results = [];
  for (const item of requests) {
    const status = await requestLoopback({ port, pinned, timeoutMs, connect,
      servername: item.servername, hostHeader: item.hostHeader });
    const ok = item.expected === 'unknown-host-rejection'
      ? status === 421
      : status >= 200 && status < 500 && status !== 421;
    if (!ok) throw new Error('Local TLS vhost routing failed (details withheld)');
    results.push({ name: item.expected, status });
  }
  return results;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const valid = args.length === 5 && args[0] === '--synthetic-only' &&
    args[1] === '--cert-file' && args[3] === '--port' && /^(?:[0-9]{4,5})$/.test(args[4]);
  if (!valid || process.env.DEPLOYMENT_ENV !== 'staging' ||
      process.env.EPMO_SYNTHETIC_ONLY !== 'YES') {
    console.error('BLOCKED: explicit synthetic-only staging mode, --cert-file and --port required');
    process.exitCode = 2;
  } else {
    probeLoopbackTls({ certFile: args[2], port: Number(args[4]) }).then(results => {
      for (const item of results) console.log(`PASS local-only ${item.name}: HTTP ${item.status}`);
      console.log('NOT ACCEPTED: public DNS, public HTTPS, live staging, tenant isolation or recovery');
    }).catch(() => {
      console.error('BLOCKED: local-only TLS probe failed; no external acceptance claimed');
      process.exitCode = 1;
    });
  }
}
