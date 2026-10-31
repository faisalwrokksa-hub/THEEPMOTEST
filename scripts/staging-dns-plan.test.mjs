import test from 'node:test';
import assert from 'node:assert/strict';
import { validateStagingDnsPlan } from './staging-dns-plan.mjs';
const plan = () => ({environment:'staging',zone:'theepmo.com',records:[
  {name:'staging.theepmo.com',type:'A',value:'8.8.8.8',ttl:300},
  {name:'api-staging.theepmo.com',type:'A',value:'8.8.4.4',ttl:300},
]});
const rejects = p => assert.ok(validateStagingDnsPlan(p).length > 0);
test('S19 accepts a structurally valid staging-only DNS proposal (not real DNS evidence)',()=>assert.deepEqual(validateStagingDnsPlan(plan()),[]));
test('S19 refuses production hostnames and duplicate records',()=>{
  const p=plan();p.records[0].name='theepmo.com';rejects(p);
  const q=plan();q.records[1].name=q.records[0].name;rejects(q);
});
test('S19 refuses nonpublic, documentation, loopback and private targets',()=>{
  for(const value of ['127.0.0.1','10.1.1.1','172.16.0.1','192.168.1.1','169.254.1.1','100.64.0.1','192.0.2.1','198.51.100.1','203.0.113.1','224.0.0.1','0.0.0.0','255.255.255.255','01.2.3.4','192.31.196.1','192.52.193.1','192.88.99.2','192.175.48.1']){
    const p=plan();p.records[0].value=value;rejects(p);
  }
});
test('S19 refuses unapproved types, extra records, extra fields and invalid TTL',()=>{
  const p=plan();p.records[0].type='CNAME';rejects(p);
  const q=plan();q.records.push({...q.records[0],name:'api.theepmo.com'});rejects(q);
  const r=plan();r.records[0].ttl=10;rejects(r);
  const s=plan();s.records[0].provider_token='secret';rejects(s);
});
