#!/usr/bin/env node
/** Read-only Servitro/Saudi deployment design guard; no network, DNS or host operations. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export function inspectHostingPlan(p) {
  const checks = [];
  const check = (name, passed) => checks.push({ name, passed: Boolean(passed) });
  const d = p?.dns || {}, e = p?.environments || {}, s = e.staging || {}, sa = e.sharedSaudiSaas || {}, prod = e.production || {}, a = p?.dedicatedAgencyTemplate || {}, r = p?.release || {};
  check('Review-only and no live DNS changes', p?.mode === 'review-only' && d.changeAuthorized === false && Array.isArray(d.recordsToApply) && d.recordsToApply.length === 0);
  check('Preserve registrar and production hostname', d.zone === 'theepmo.com' && d.authority === 'existing registrar and authoritative DNS' && d.productionWeb === 'app.theepmo.com' && d.productionUntouched === true && prod.hostname === d.productionWeb && prod.deploymentAuthorized === false && prod.dnsAuthorized === false);
  check('Stage on designated subdomains only', d.stagingWeb === 'staging.theepmo.com' && d.stagingApi === 'api-staging.theepmo.com' && s.id === 'staging' && s.isolatedComposeProject === 'pmo-staging');
  check('German VPS is synthetic-data staging only', s.hostProvider === 'Servitro' && s.hostLocation === 'Frankfurt, Germany' && s.syntheticDataOnly === true && s.productionCredentialsAllowed === false && s.sharedSaudiTenantDataAllowed === false && s.provisioned === false);
  check('Staging ports, private data and recovery remain gated', s.exposure === 'loopback-only until separate authorization' && s.apiDatabaseNetwork === 'internal-only' && /pending/.test(s.tls) && /pending/.test(s.backups));
  check('Saudi shared SaaS requires verified Saudi hosting and tenant isolation', sa.requiredCountry === 'SA' && sa.hostLocationVerified === false && sa.provisioned === false && sa.hostProvider === null && sa.saudiDataOnForeignHostAllowed === false && ['postgresql-rls','tenant-bound-foreign-keys','restricted-app-role','cross-tenant-negative-tests'].every(x => sa.tenantIsolation?.includes(x)));
  check('Dedicated agency must not share compute, stores, identities, keys or backups', a.state === 'template-only' && a.perAgencyProvisioningRequiresApproval === true && ['shareRuntimeWithSharedSaas','shareDatabaseWithSharedSaas','shareIdentityWithSharedSaas','shareEncryptionKeysWithSharedSaas','shareBackupsWithSharedSaas'].every(k => a[k] === false));
  check('No external acceptance is represented as complete', r.decision === 'NO-GO' && r.commercialGatesAccepted === 0 && ['externalHttpsVerified','encryptedRestoreVerified','tenantRlsStagingVerified','realStripeTestVerified','entraTwoUserVerified','arabicRtlUatVerified'].every(k => r[k] === false));
  return checks;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = JSON.parse(readFileSync(new URL('./servitro-plan.json', import.meta.url), 'utf8'));
  const failures = inspectHostingPlan(p).filter(x => !x.passed);
  console.log(failures.length ? 'FAIL: ' + failures.map(x => x.name).join('; ') : 'PASS: 8 offline, read-only deployment safeguards');
  if (failures.length) process.exitCode = 1;
}
