import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDeploymentDraft } from './deployment-planning.mjs';
const base={workspace:'agency-1',profile:'shared',organizationType:'private',classification:'undetermined',privateIngress:false};
test('local planning never asserts approval or activation',()=>{const d=makeDeploymentDraft(base);assert.equal(d.state,'local_draft_not_submitted');assert.equal(d.complianceApproved,false);assert.equal(d.provisioned,false);assert.equal(d.requestedResidency,'SA');});
test('dedicated government request remains unapproved',()=>{const d=makeDeploymentDraft({...base,profile:'dedicated',organizationType:'government',classification:'restricted',privateIngress:true});assert.equal(d.requestedIngress,'private');assert.equal(d.complianceApproved,false);});
test('reject malformed or incompatible choices',()=>{for(const x of [{profile:'approved'},{classification:'certified'},{workspace:'../bad'},{privateIngress:true},{privateIngress:'true'}])assert.throws(()=>makeDeploymentDraft({...base,...x}));});
