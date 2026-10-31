/**
 * S10 offline staging profile gate.
 * Checks metadata consistency only. It does not contact infrastructure,
 * retrieve credentials, prove physical isolation or authorize a deployment.
 */
import { verifyDeploymentIsolationMatrix } from './deployment-boundaries.mjs';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const result=(name,passed)=>({name,passed:Boolean(passed)});
export function stagingProfileChecks(env,inventory) {
  const profile=env?.EPMO_DEPLOYMENT_PROFILE;
  const entries=inventory?.deployments;
  const approved=inventory?.approvedRegions;
  const checks=[
    result('Explicit staging target',env?.DEPLOYMENT_ENV==='staging'&&env?.NODE_ENV==='production'),
    result('Recognized deployment profile',profile==='shared'||profile==='dedicated'),
    result('Runtime deployment has valid UUID',UUID.test(String(env?.EPMO_DEPLOYMENT_ID||''))),
    result('Only independently allowlisted Saudi region',Array.isArray(approved)&&approved.length>0&&
      approved.includes(env?.EPMO_DEPLOYMENT_REGION)&&env?.EPMO_ALLOWED_DEPLOYMENT_REGIONS?.split(',').map(s=>s.trim()).includes(env?.EPMO_DEPLOYMENT_REGION)),
    result('Runtime API origin uses approved HTTPS staging endpoint',
      env?.EPMO_DEPLOYMENT_API_ORIGIN==='https://api-staging.theepmo.com'),
    result('No real Stripe billing credentials in staging',
      env?.STRIPE_SECRET_KEY===undefined||(!/^(?:sk|rk)_live_/.test(String(env.STRIPE_SECRET_KEY))&&
      env?.STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION!=='false')),
    result('No browser tenant impersonation',env?.ALLOW_HEADER_AUTH!=='true'),
  ];
  const matrix=verifyDeploymentIsolationMatrix(entries,approved);
  checks.push(...matrix);
  const matched=Array.isArray(entries)?entries.filter(row=>row?.deploymentId===env?.EPMO_DEPLOYMENT_ID):[];
  checks.push(result('Exactly one selected runtime inventory row',matched.length===1));
  if(matched.length===1){
    const selected=matched[0];
    checks.push(result('Selected runtime is same profile and approved region',
      selected.profile===profile && selected.region===env?.EPMO_DEPLOYMENT_REGION && selected.dataResidency==='SA'));
    checks.push(result('Dedicated deployment requires dedicated DB, KMS, logs and backup labels',
      profile!=='dedicated' || ['database','kms','audit','backup'].every(k=>typeof selected.resources?.[k]==='string'&&selected.resources[k].includes('dedicated'))));
  }
  // Explicit limits: no proxy headers, hostname or user-supplied tenant determine placement.
  return checks;
}
