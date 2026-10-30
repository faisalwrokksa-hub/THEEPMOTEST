import { describe, it, expect } from 'vitest';
import { parseRuntimeDeployment, assertRuntimeDeploymentTenant } from '../apps/api/src/tenancy/deployment-runtime';
const a='11111111-1111-4111-8111-111111111111';
const b='22222222-2222-4222-8222-222222222222';
const deployment='33333333-3333-4333-8333-333333333333';
const record=(tenantId:string,profile:'shared'|'dedicated'='shared')=>({
  tenantId,deploymentId:deployment,profile,region:'approved-sa-region',dataResidency:'SA',
  databaseIsolation:profile==='shared'?'shared-rls':'dedicated',
  keyIsolation:profile==='shared'?'tenant-context':'dedicated',
  apiOrigin:'https://api-staging.theepmo.com',
});
const env=(rows:unknown[],profile:'shared'|'dedicated'='shared'):NodeJS.ProcessEnv=>({
  EPMO_DEPLOYMENT_PROFILE:profile,
  EPMO_DEPLOYMENT_ID:deployment,
  EPMO_DEPLOYMENT_REGION:'approved-sa-region',
  EPMO_DEPLOYMENT_API_ORIGIN:'https://api-staging.theepmo.com',
  EPMO_ALLOWED_DEPLOYMENT_REGIONS:'approved-sa-region',
  EPMO_DEPLOYMENT_BINDINGS_JSON:JSON.stringify(rows),
});
describe('E12 runtime deployment boundary',()=>{
  it('accepts authenticated members of this shared deployment only',()=>{
    const runtime=parseRuntimeDeployment(env([record(a),record(b)]));
    expect(runtime?.tenantBindings.size).toBe(2);
    expect(()=>assertRuntimeDeploymentTenant(runtime,{tenantId:a,userId:'user-1'})).not.toThrow();
    expect(()=>assertRuntimeDeploymentTenant(runtime,{tenantId:'44444444-4444-4444-8444-444444444444',userId:'user-1'})).toThrow();
    expect(()=>assertRuntimeDeploymentTenant(runtime,{tenantId:a,userId:''})).toThrow();
  });
  it('requires a single mapped tenant in dedicated mode',()=>{
    const runtime=parseRuntimeDeployment(env([record(a,'dedicated')],'dedicated'));
    expect(runtime?.profile).toBe('dedicated');
    expect(()=>parseRuntimeDeployment(env([record(a,'dedicated'),record(b,'dedicated')],'dedicated'))).toThrow();
  });
  it('rejects misplaced regions, wrong deployment and inconsistent isolation',()=>{
    expect(()=>parseRuntimeDeployment(env([{...record(a),region:'other-region'}]))).toThrow();
    expect(()=>parseRuntimeDeployment(env([{...record(a),deploymentId:b}]))).toThrow();
    expect(()=>parseRuntimeDeployment(env([{...record(a),databaseIsolation:'dedicated'}]))).toThrow();
    expect(()=>parseRuntimeDeployment(env([{...record(a),apiOrigin:'https://evil.example'}]))).toThrow();
  });
  it('rejects malformed/duplicate inventory and partial settings',()=>{
    expect(()=>parseRuntimeDeployment(env([record(a),record(a)]))).toThrow();
    expect(()=>parseRuntimeDeployment({...env([record(a)]),EPMO_DEPLOYMENT_BINDINGS_JSON:'bad-json'})).toThrow();
    expect(()=>parseRuntimeDeployment({EPMO_DEPLOYMENT_ID:deployment})).toThrow();
    expect(()=>parseRuntimeDeployment({...env([record(a)]),EPMO_DEPLOYMENT_PROFILE:'government'})).toThrow();
  });
  it('keeps legacy shared mode explicit and does not treat it as dedicated validation',()=>{
    expect(parseRuntimeDeployment({DEPLOYMENT_ENV:'development'})).toBeNull();
  });
});
