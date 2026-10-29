import test from 'node:test';
import assert from 'node:assert/strict';
import {trialChecklist, TRIAL_EXAMPLE} from './trial-guidance.mjs';
test('trial checklist is factual and bilingual', () => {
 const rows = trialChecklist([{key:'workspace',completed:true},{key:'project',completed:false}], 'ar');
 assert.equal(rows.length,5); assert.equal(rows[0].completed,true);
 assert.equal(rows[4].completed,false); assert.match(rows[0].label,/مساحة/);
});
test('trial example is synthetic, frozen and not customer state',()=>{
 assert.equal(TRIAL_EXAMPLE.synthetic,true);assert.equal(Object.isFrozen(TRIAL_EXAMPLE),true);
});
