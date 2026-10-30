import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyDeploymentIsolationMatrix as matrix,deploymentOperationalReadiness as ready} from '../infra/staging/deployment-boundaries.mjs';
const id1='11111111-1111-4111-8111-111111111111', id2='22222222-2222-4222-8222-222222222222';
const shared={tenantId:id1,deploymentId:id1,profile:'shared',region:'approved-sa-region',dataResidency:'SA',
 resources:{runtime:'stg-shared-runtime',database:'stg-shared-database',storage:'stg-shared-storage',kms:'stg-shared-keyring',audit:'stg-shared-audit',backup:'stg-shared-backup'}};
const dedicated={tenantId:id2,deploymentId:id2,profile:'dedicated',region:'approved-sa-region',dataResidency:'SA',
 resources:{runtime:'stg-dedicated-runtime',database:'stg-dedicated-database',storage:'stg-dedicated-storage',kms:'stg-dedicated-keyring',audit:'stg-dedicated-audit',backup:'stg-dedicated-backup'}};
const failed=(rows)=>matrix(rows,['approved-sa-region']).filter(c=>!c.passed).map(c=>c.name);
test('A04/A05 shared and dedicated staging plans use independent named resources',()=>{
 assert.deepEqual(failed([shared,dedicated]),[]);
});
test('A04/A05 detect shared DB, keys, logs, backups and runtime names across deployments',()=>{
 for(const key of Object.keys(shared.resources))
  assert.ok(failed([shared,{...dedicated,resources:{...dedicated.resources,[key]:shared.resources[key]}}]).some(n=>n.includes(key)),key);
});
test('A04/A05 reject wrong residency, unapproved region, missing metadata and secret fields',()=>{
 assert.ok(failed([shared,{...dedicated,region:'outside'}]).length);
 assert.ok(failed([shared,{...dedicated,dataResidency:'EU'}]).length);
 assert.ok(failed([shared,{...dedicated,dbPassword:'do-not-store'}]).length);
});
test('A06 requires independent operational acceptance; never infers ready from inventory',()=>{
 assert.equal(ready({}),false);
 assert.equal(ready({providerApproved:true,physicalIsolationVerified:true,tlsVerified:true,encryptedBackupRestored:true,rollbackRehearsed:true,tenantNegativeTestsPassed:true,telemetryRedactionVerified:true}),false);
 assert.equal(ready({providerApproved:true,physicalIsolationVerified:true,tlsVerified:true,encryptedBackupRestored:true,rollbackRehearsed:true,tenantNegativeTestsPassed:true,telemetryRedactionVerified:true,securityApproved:true}),true);
});
