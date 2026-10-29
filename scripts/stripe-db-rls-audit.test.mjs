import test from 'node:test';
import assert from 'node:assert/strict';
import {FINANCIAL_TABLES, validateStripeDbAuditConfig, inspectFinancialSchema, verifyVisibleRows, auditStripeDbRls} from './stripe-db-rls-audit.mjs';
const A='11111111-1111-4111-8111-111111111111';
const B='22222222-2222-4222-8222-222222222222';
const env={DEPLOYMENT_ENV:'staging',DATABASE_URL:'postgresql://pmo_app:secret@db.example.test:5432/pmo',STRIPE_DB_TENANT_A_ID:A,STRIPE_DB_TENANT_B_ID:B};
const catalogue=FINANCIAL_TABLES.map(name=>({name,rlsEnabled:true,rlsForced:true,policyCount:1}));
test('rejects production mode',()=>assert.throws(()=>validateStripeDbAuditConfig({...env,DEPLOYMENT_ENV:'production'})));
test('rejects admin database roles',()=>assert.throws(()=>validateStripeDbAuditConfig({...env,DATABASE_URL:'postgres://postgres:secret@db.example.test/pmo'})));
test('rejects equal tenants',()=>assert.throws(()=>validateStripeDbAuditConfig({...env,STRIPE_DB_TENANT_B_ID:A})));
test('accepts staging restricted-role configuration',()=>assert.equal(validateStripeDbAuditConfig(env).tenantA,A));
test('all financial tables require FORCE RLS and policy',()=>assert.deepEqual(inspectFinancialSchema(catalogue),[]));
test('missing migration is detected',()=>assert.match(inspectFinancialSchema(catalogue.slice(1))[0],/migration missing/));
test('RLS enabled but not forced fails',()=>assert.match(inspectFinancialSchema(catalogue.map((r,i)=>i===0?{...r,rlsForced:false}:r))[0],/RLS/));
test('missing policy fails',()=>assert.match(inspectFinancialSchema(catalogue.map((r,i)=>i===0?{...r,policyCount:0}:r))[0],/policy/));
test('tenant rows visible with matching tenant',()=>assert.equal(verifyVisibleRows([{tenantId:A,rowCount:1}],A,'billing_invoices'),1));
test('detects cross-tenant rows',()=>assert.throws(()=>verifyVisibleRows([{tenantId:B,rowCount:1}],A,'billing_invoices'),/ISOLATION FAILURE/));
test('detects visibility with unset tenant',()=>assert.throws(()=>verifyVisibleRows([{tenantId:A,rowCount:1}],null,'billing_invoices'),/ISOLATION FAILURE/));

function fakeDb({role='pmo_app',superuser=false,bypass=false,missingRows=false,leak=false}={}){
  const t=async (fragments,...args)=>{
    const sql=String.raw({raw:fragments},...args);
    if(sql.includes('current_user')) return [{dbRole:role,isSuperuser:superuser,bypassRls:bypass}];
    if(sql.includes('pg_class')) return catalogue;
    throw new Error(`Unexpected query: ${sql}`);
  };
  t.begin=async callback=>{
    let tenant=null;
    const tx=async (fragments,...args)=>{
      const sql=String.raw({raw:fragments},...args);
      if(sql.startsWith('SET TRANSACTION READ ONLY'))return [];
      if(sql.includes("set_config('app.tenant_id'")){tenant=args[0]||null;return [];}
      throw new Error(`Unexpected tx query: ${sql}`);
    };
    tx.unsafe=async sql=>{
      const table=FINANCIAL_TABLES.find(name=>sql.includes(`public.${name} `));
      if(!table)throw new Error('Unsafe or unknown table query');
      if(!tenant)return leak?[{tenantId:A,rowCount:1}]:[];
      if(table==='tenant_subscriptions'||(table==='billing_invoices'&&tenant===A))
        return missingRows?[]:[{tenantId:tenant,rowCount:1}];
      return [];
    };
    return callback(tx);
  };
  return t;
}
test('accepts read-only staging audit with two populated tenants',async()=>{
 const result=await auditStripeDbRls(fakeDb(),A,B);
 assert.equal(result.passed,true);assert.equal(result.tables,FINANCIAL_TABLES.length);
});
test('rejects superuser or bypass-RLS application connection',async()=>{
 await assert.rejects(auditStripeDbRls(fakeDb({superuser:true}),A,B),/Unsafe database role/);
 await assert.rejects(auditStripeDbRls(fakeDb({bypass:true}),A,B),/Unsafe database role/);
});
test('rejects empty data as inconclusive',async()=>{
 await assert.rejects(auditStripeDbRls(fakeDb({missingRows:true}),A,B),/Inconclusive/);
});
test('rejects records visible with no tenant selected',async()=>{
 await assert.rejects(auditStripeDbRls(fakeDb({leak:true}),A,B),/ISOLATION FAILURE/);
});

test('aggregated counts are not limited to one row',()=>{
 assert.equal(verifyVisibleRows([{tenantId:A,rowCount:12001}],A,'billing_invoices'),12001);
});
test('rejects invalid aggregation counts',()=>{
 assert.throws(()=>verifyVisibleRows([{tenantId:A,rowCount:-1}],A,'billing_invoices'),/Invalid/);
});
