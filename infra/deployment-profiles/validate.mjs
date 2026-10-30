#!/usr/bin/env node
/**
 * Offline, provider-neutral dual-deployment contract guard.
 * No DNS, network, Docker, Terraform, credentials or customer data.
 * Templates are intentionally not deployment authorization.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const profiles = Object.freeze({
  shared_sa: {
    network: 'shared_vpc', runtime: 'shared_cluster',
    database: 'tenant_rls', objectStorage: 'tenant_iam_prefix',
    kms: 'per_tenant_context', secrets: 'tenant_scoped',
    logs: 'tenant_scoped', backup: 'tenant_scoped',
  },
  dedicated_sa: {
    network: 'dedicated_vpc', runtime: 'dedicated_cluster',
    database: 'dedicated_instance', objectStorage: 'dedicated_bucket',
    kms: 'dedicated_key', secrets: 'dedicated_store',
    logs: 'dedicated_sink', backup: 'dedicated_vault',
  },
});
const sha = /^[0-9a-f]{40}$/;
const identifier = /^[a-z][a-z0-9-]{2,62}$/;
const evidence = /^EVID-[A-Z0-9][A-Z0-9-]{5,79}$/;
const keys = Object.keys(profiles.shared_sa);
const approvalKeys = [
  'providerEligibility', 'customerClassification', 'regionApproval',
  'tenantIsolation', 'backupRestore', 'rollbackRehearsal', 'securityReview',
];
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const exactKeys = (obj, expected) => isObject(obj) &&
  Object.keys(obj).sort().join('|') === [...expected].sort().join('|');

export function validateDeploymentProfile(input, mode = 'template') {
  const errors = [];
  const check = (name, condition) => { if (!condition) errors.push(name); };
  check('mode', mode === 'template' || mode === 'release');
  check('schemaVersion', input?.schemaVersion === 1);
  check('top-level fields', exactKeys(input, [
    'schemaVersion', 'environment', 'profile', 'deploymentId', 'tenantId',
    'provider', 'region', 'dataResidency', 'imageSha', 'infrastructure', 'evidence',
  ]));
  check('staging-only environment', input?.environment === 'staging');
  check('profile', Object.hasOwn(profiles, input?.profile ?? ''));
  check('deploymentId', identifier.test(input?.deploymentId ?? ''));
  check('Saudi residency', input?.dataResidency === 'SA');
  check('tenant binding', input?.profile === 'shared_sa'
    ? input?.tenantId === null
    : identifier.test(input?.tenantId ?? '') && input?.tenantId !== input?.deploymentId);
  check('provider value', typeof input?.provider === 'string' &&
    (input.provider === 'UNSELECTED' || identifier.test(input.provider)));
  check('region value', typeof input?.region === 'string' &&
    (input.region === 'UNSELECTED' || /^sa-[a-z0-9-]{3,48}$/.test(input.region)));
  check('image revision', input?.imageSha === 'UNBUILT' || sha.test(input?.imageSha ?? ''));

  const infra = input?.infrastructure;
  check('infrastructure components', exactKeys(infra, [
    ...keys, 'privateSubnets', 'publicApi', 'publicDatabase',
    'encryptedDatabase', 'encryptedObjectStorage', 'encryptedBackups',
    'payloadRedaction', 'restoreTestRequired', 'immutableImageRollback',
    'schemaDowngradeAllowed', 'backupRetentionDays',
  ]));
  const expected = profiles[input?.profile];
  if (expected) for (const key of keys) check(key + ' isolation', infra?.[key] === expected[key]);
  for (const field of [
    'privateSubnets', 'encryptedDatabase', 'encryptedObjectStorage',
    'encryptedBackups', 'payloadRedaction', 'restoreTestRequired',
    'immutableImageRollback',
  ]) check(field, infra?.[field] === true);
  for (const field of ['publicApi', 'publicDatabase', 'schemaDowngradeAllowed'])
    check(field, infra?.[field] === false);
  check('backup retention', Number.isInteger(infra?.backupRetentionDays) &&
    infra.backupRetentionDays >= 7 && infra.backupRetentionDays <= 3650);

  const proofs = input?.evidence;
  check('evidence fields', exactKeys(proofs, approvalKeys));
  for (const field of approvalKeys)
    check('evidence ' + field, typeof proofs?.[field] === 'string' &&
      (proofs[field] === 'PENDING' || evidence.test(proofs[field])));

  if (mode === 'release') {
    check('approved provider', input?.provider !== 'UNSELECTED');
    check('approved Saudi region', input?.region !== 'UNSELECTED');
    check('exact immutable image SHA', sha.test(input?.imageSha ?? ''));
    for (const field of approvalKeys) check('approved ' + field, evidence.test(proofs?.[field] ?? ''));
  }
  return { valid: errors.length === 0, checks: errors.length, errors };
}

export function readAndValidate(path, mode = 'template') {
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return validateDeploymentProfile(parsed, mode);
}

const invoked = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  if (process.argv.length !== 5 || process.argv[2] !== '--mode' ||
      !['template', 'release'].includes(process.argv[3])) {
    console.error('Usage: node infra/deployment-profiles/validate.mjs --mode template|release <profile.json>');
    process.exitCode = 2;
  } else {
    try {
      const result = readAndValidate(process.argv[4], process.argv[3]);
      for (const error of result.errors) console.error('BLOCKED ' + error);
      if (result.valid) console.log('PASS offline ' + process.argv[3] +
        ' profile contract (not infrastructure or regulatory approval)');
      else process.exitCode = 1;
    } catch {
      console.error('BLOCKED malformed or missing deployment profile (values withheld)');
      process.exitCode = 1;
    }
  }
}
