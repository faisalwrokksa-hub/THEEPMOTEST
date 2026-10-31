#!/usr/bin/env node
/** Offline signer for an independently reviewed staging DNS proposal. No network calls. */
import { createHash, createPrivateKey, sign } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateStagingDnsPlan } from './staging-dns-plan.mjs';
import { canonicalDnsJson } from './staging-dns-approval.mjs';

export function createStagingDnsApproval(plan, privateKeyPem, changeId, approvedBy, now = Date.now()) {
  const issues = validateStagingDnsPlan(plan);
  if (issues.length) throw new Error('Invalid staging DNS plan');
  if (typeof changeId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{3,79}$/.test(changeId))
    throw new Error('Invalid change ID');
  if (typeof approvedBy !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9@._-]{2,127}$/.test(approvedBy))
    throw new Error('Invalid approver ID');
  if (typeof privateKeyPem !== 'string' || !/^-----BEGIN PRIVATE KEY-----\r?\n/.test(privateKeyPem))
    throw new Error('Require Ed25519 PKCS8 private key PEM');
  const key = createPrivateKey(privateKeyPem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('Require Ed25519 signing key');
  if (!Number.isFinite(now)) throw new Error('Invalid timestamp');
  const payload = {
    environment: 'staging', zone: 'theepmo.com',
    planSha256: createHash('sha256').update(canonicalDnsJson(plan)).digest('hex'),
    changeId, approvedBy, issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 60 * 60_000).toISOString(),
  };
  return { payload, signature: sign(null, Buffer.from(canonicalDnsJson(payload)), key).toString('base64') };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const flags = ['--plan', '--private-key', '--change-id', '--approved-by', '--output'];
  const argv = process.argv.slice(2), args = {};
  for (let i = 0; i < argv.length; i += 2) {
    if (!flags.includes(argv[i]) || args[argv[i]] || !argv[i + 1]) {
      console.error('BLOCKED: invalid arguments');
      process.exit(2);
    }
    args[argv[i]] = argv[i + 1];
  }
  if (argv.length !== 10 || flags.some(k => !args[k])) {
    console.error('Usage: node scripts/sign-staging-dns-plan.mjs --plan plan.json --private-key signer.pem --change-id CHANGE-ID --approved-by reviewer --output signed.json');
    process.exit(2);
  }
  try {
    const keyStat = lstatSync(args['--private-key']);
    if (!keyStat.isFile() || keyStat.isSymbolicLink() ||
        (process.platform !== 'win32' && (keyStat.mode & 0o077) !== 0))
      throw new Error('Signing key must be a regular private file with owner-only permissions');
    const approval = createStagingDnsApproval(
      JSON.parse(readFileSync(args['--plan'], 'utf8')),
      readFileSync(args['--private-key'], 'utf8'),
      args['--change-id'], args['--approved-by'],
    );
    writeFileSync(args['--output'], JSON.stringify(approval, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    console.log('PASS: offline signed approval written; independently reviewed public-key fingerprint and provider ownership evidence still required');
  } catch {
    console.error('BLOCKED: invalid inputs or output already exists; no DNS/provider changes made');
    process.exitCode = 1;
  }
}