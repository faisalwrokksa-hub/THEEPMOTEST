import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../docs/commercial-release-evidence.json',import.meta.url),'utf8'));
test('release acceptance is explicitly blocked until same-candidate external receipts exist',()=>{
 assert.equal(manifest.decision,'NO-GO');
 assert.equal(manifest.candidateSha,null);
 for(const name of ['microsoft_per_user_oauth','stripe_test_billing','frontend_customer_journeys','staging_smoke','backup_restore_rollback']) assert.notEqual(manifest.gates[name].status,'PASS',name);
});
