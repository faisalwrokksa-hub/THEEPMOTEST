import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDeploymentBinding, assertImmutableDeploymentBinding, resolveAuthorizedDeployment } from '../packages/contracts/src/deployment.ts';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const c='33333333-3333-4333-8333-333333333333';
const allow={regions:['approved-sa-region'],apiOrigins:['https://api-staging.theepmo.com']};
const shared={tenantId:a,deploymentId:b,profile:'shared',region:'approved-sa-region',dataResidency:'SA',databaseIsolation:'shared-rls',keyIsolation:'tenant-context',apiOrigin:'https://api-staging.theepmo.com'};
const dedicated={...shared,profile:'dedicated',databaseIsolation:'dedicated',keyIsolation:'dedicated'};
test('A02 validates both deployment profiles using explicit allowlists',()=>{
  assert.equal(parseDeploymentBinding(shared,allow).profile,'shared');
  assert.equal(parseDeploymentBinding(dedicated,allow).profile,'dedicated');
});
test('A02 rejects unapproved regions, public origins, inconsistent isolation and extra keys',()=>{
  for(const bad of [
    {...shared,region:'outside-ksa'}, {...shared,dataResidency:'EU'},
    {...dedicated,databaseIsolation:'shared-rls'}, {...shared,keyIsolation:'dedicated'},
    {...shared,apiOrigin:'http://api-staging.theepmo.com'},
    {...shared,apiOrigin:'https://api-staging.theepmo.com.evil.example'},
    {...shared,apiOrigin:'https://api-staging.theepmo.com/other'},
    {...shared,tenantId:'spoofed'}, {...shared,clientSuppliedTenantId:c},
  ]) assert.throws(()=>parseDeploymentBinding(bad,allow));
});
test('A02 rejects any mutable tenant, deployment, profile, region, or key binding',()=>{
  const original=parseDeploymentBinding(shared,allow);
  assert.doesNotThrow(()=>assertImmutableDeploymentBinding(original,parseDeploymentBinding({...shared},allow)));
  for(const delta of [{tenantId:c},{deploymentId:c},{profile:'dedicated',databaseIsolation:'dedicated',keyIsolation:'dedicated'}])
    assert.throws(()=>assertImmutableDeploymentBinding(original,parseDeploymentBinding({...shared,...delta},allow)));
});
test('A03 server-authorized route fails closed for cross-tenant membership, impersonation and deployment mismatch',()=>{
  const binding=parseDeploymentBinding(shared,allow);
  const good={authenticatedUserId:'user-1',membershipUserId:'user-1',membershipTenantId:a,requestedTenantId:a,runtimeDeploymentId:b,runtimeRegion:'approved-sa-region',binding};
  assert.equal(resolveAuthorizedDeployment(good).apiOrigin,'https://api-staging.theepmo.com');
  for(const delta of [
    {authenticatedUserId:'user-2'},{membershipTenantId:c},{requestedTenantId:c},
    {runtimeDeploymentId:c},{runtimeRegion:'outside-ksa'},{membershipUserId:null},
  ]) assert.throws(()=>resolveAuthorizedDeployment({...good,...delta}));
});
