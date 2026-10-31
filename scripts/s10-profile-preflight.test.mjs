import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {stagingProfileChecks} from '../infra/staging/s10-profile-preflight.mjs';
const inv=JSON.parse(readFileSync(new URL('../infra/staging/deployment-matrix.example.json',import.meta.url)));
const env={
 DEPLOYMENT_ENV:'staging',NODE_ENV:'production',ALLOW_HEADER_AUTH:'false',
 EPMO_DEPLOYMENT_PROFILE:'dedicated',
 EPMO_DEPLOYMENT_ID:'22222222-2222-4222-8222-222222222222',
 EPMO_DEPLOYMENT_REGION:'approved-sa-region',
 EPMO_ALLOWED_DEPLOYMENT_REGIONS:'approved-sa-region',
 EPMO_DEPLOYMENT_API_ORIGIN:'https://api-staging.theepmo.com',
 STRIPE_SECRET_KEY:'sk_test_dummy',STRIPE_ALLOW_TEST_MODE_IN_PRODUCTION:'true',
};
const failures=e=>stagingProfileChecks(e,inv).filter(c=>!c.passed).map(c=>c.name);
test('S10 designated isolated staging profile passes metadata checks',()=>{
 assert.deepEqual(failures(env),[]);
});
test('S10 rejects production selection, bad region, missing runtime and live Stripe keys',()=>{
 for(const delta of [{DEPLOYMENT_ENV:'production'},{EPMO_DEPLOYMENT_REGION:'other'},
 {EPMO_DEPLOYMENT_ID:'invalid'},{STRIPE_SECRET_KEY:'sk_live_forbidden'},
 {STRIPE_SECRET_KEY:'rk_live_forbidden'},
 {ALLOW_HEADER_AUTH:'true'},{EPMO_DEPLOYMENT_PROFILE:'shared'}])
 assert.ok(failures({...env,...delta}).length>0,JSON.stringify(delta));
});
test('S10 rejects collisions even for otherwise valid dedicated metadata',()=>{
 const bad=structuredClone(inv);
 bad.deployments[1].resources.database=bad.deployments[0].resources.database;
 assert.ok(stagingProfileChecks(env,bad).some(c=>!c.passed&&c.name.includes('database')));
});
