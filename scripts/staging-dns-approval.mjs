#!/usr/bin/env node
/** Offline signed DNS approval gate; never contacts DNS, provider or hosts. */
import { createHash, createPublicKey, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStagingDnsPlan } from './staging-dns-plan.mjs';

export function canonicalDnsJson(value) {
  if (Array.isArray(value)) return '[' + value.map(canonicalDnsJson).join(',') + ']';
  if (value !== null && typeof value === 'object')
    return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalDnsJson(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const keysAre = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
  Object.keys(object).sort().join(',') === [...keys].sort().join(',');
const exactUtc = s => typeof s === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(s) &&
  Number.isFinite(Date.parse(s)) && new Date(Date.parse(s)).toISOString() === s;

export function validateSignedDnsApproval({ plan, approval, trustedPublicKeyPem, trustedKeySha256, now = Date.now() }) {
  const issues = validateStagingDnsPlan(plan);
  if (!keysAre(approval, ['payload', 'signature'])) return [...issues, 'Approval envelope must contain only payload and signature'];
  const p = approval.payload;
  if (!keysAre(p, ['environment', 'zone', 'planSha256', 'changeId', 'approvedBy', 'issuedAt', 'expiresAt']))
    return [...issues, 'Invalid approval payload fields'];
  if (p.environment !== 'staging' || p.zone !== 'theepmo.com') issues.push('Approval environment/zone mismatch');
  if (typeof p.changeId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{3,79}$/.test(p.changeId)) issues.push('Invalid change ID');
  if (typeof p.approvedBy !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9@._-]{2,127}$/.test(p.approvedBy)) issues.push('Invalid approver identifier');
  if (typeof p.planSha256 !== 'string' || p.planSha256 !== sha256(canonicalDnsJson(plan)))
    issues.push('Approval does not bind to exact DNS plan');
  if (!exactUtc(p.issuedAt) || !exactUtc(p.expiresAt)) issues.push('Approval timestamps must be exact UTC ISO timestamps');
  else {
    const issued = Date.parse(p.issuedAt), expires = Date.parse(p.expiresAt);
    if (!Number.isFinite(now) || issued > now + 5 * 60_000 || expires <= now ||
        expires <= issued || expires - issued > 24 * 3600_000)
      issues.push('Approval expired, not yet valid, or exceeds 24-hour validity');
  }
  if (typeof trustedKeySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(trustedKeySha256)) {
    issues.push('Missing trusted public-key fingerprint');
    return issues;
  }
  try {
    const key = createPublicKey(trustedPublicKeyPem);
    if (key.asymmetricKeyType !== 'ed25519') throw new Error('Not Ed25519');
    if (sha256(key.export({ type: 'spki', format: 'der' })) !== trustedKeySha256)
      issues.push('Trusted public-key fingerprint mismatch');
    const signature = approval.signature;
    if (typeof signature !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(signature))
      throw new Error('Invalid base64');
    const bytes = Buffer.from(signature, 'base64');
    if (bytes.length !== 64 || bytes.toString('base64') !== signature ||
        !verify(null, Buffer.from(canonicalDnsJson(p)), key, bytes))
      issues.push('Invalid approval signature');
  } catch {
    issues.push('Invalid trusted key or approval signature');
  }
  return issues;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const flags = ['--plan', '--approval', '--trusted-key', '--trusted-fingerprint'];
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!flags.includes(argv[i]) || args[argv[i]] || !argv[i + 1]) {
      console.error('BLOCKED: invalid arguments');
      process.exit(2);
    }
    args[argv[i]] = argv[i + 1];
  }
  if (argv.length !== 8 || flags.some(k => !args[k])) {
    console.error('Usage: node scripts/staging-dns-approval.mjs --plan plan.json --approval signed.json --trusted-key approved-public.pem --trusted-fingerprint <reviewed-spki-sha256>');
    process.exit(2);
  }
  try {
    const issues = validateSignedDnsApproval({
      plan: JSON.parse(readFileSync(args['--plan'], 'utf8')),
      approval: JSON.parse(readFileSync(args['--approval'], 'utf8')),
      trustedPublicKeyPem: readFileSync(args['--trusted-key'], 'utf8'),
      trustedKeySha256: args['--trusted-fingerprint'],
    });
    for (const issue of issues) console.error('BLOCKED: ' + issue);
    if (issues.length) process.exitCode = 1;
    else console.log('PASS: offline signature and exact staging DNS plan binding only; no DNS, TLS, ownership or residency verified');
  } catch {
    console.error('BLOCKED: unreadable or malformed approval inputs');
    process.exitCode = 1;
  }
}