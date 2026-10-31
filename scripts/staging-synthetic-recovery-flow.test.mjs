import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSyntheticDrill } from './staging-synthetic-recovery.mjs';
const fake = String.raw`#!/usr/bin/env node
const fs=require('node:fs');const path=require('node:path');
const raw=process.argv.slice(2), bin=path.basename(process.argv[1]);
if(bin==='docker' && (raw[0]!=='--host'||raw[1]!=='unix:///var/run/docker.sock'))process.exit(9);
const args=bin==='docker'?raw.slice(2):raw;
const dir=__DIR__;const log=__LOG__;const corrupt=__CORRUPT__;
const write=(s)=>fs.appendFileSync(log,s+'\n');
const state=n=>path.join(dir,n+'.state');
if(bin==='docker'){
 const op=args[0];
 if(op==='image'&&args[1]==='inspect'){write('image-inspect');}
 else if(op==='run') {const n=args[args.indexOf('--name')+1];fs.writeFileSync(state(n),'new');write('run '+n);process.stdout.write(n);}
 else if(op==='rm') {const n=args.at(-1);fs.rmSync(state(n),{force:true});write('rm '+n);}
 else if(op==='exec') {
   const n=args[args[1]==='-i'?2:1],cmd=args.find(x=>['psql','pg_dump','pg_restore','pg_isready'].includes(x));
   if(cmd==='pg_isready')process.stdout.write('ready');
   else if(cmd==='pg_dump'){write('dump');process.stdout.write('PGDMP'+('synthetic'.repeat(35)));}
   else if(cmd==='pg_restore'){fs.readFileSync(0);fs.writeFileSync(state(n),'restored');write('restore '+n);}
   else if(cmd==='psql'){
     const query=args[args.indexOf('-c')+1]||'';
     if(query.includes('SELECT id,marker')){
       const current=fs.readFileSync(state(n),'utf8');
       process.stdout.write(current==='corrupt'?'1|S34_SYNTHETIC_CORRUPTED\n2|S34_SYNTHETIC_B\n':'1|S34_SYNTHETIC_A\n2|S34_SYNTHETIC_B\n');
     } else if(query.includes('UPDATE')){fs.writeFileSync(state(n),'corrupt');write('mutate '+n);}
     else {fs.readFileSync(0);fs.writeFileSync(state(n),'seeded');write('seed '+n);}
   }
 }else process.exit(9);
}else if(bin==='aws'){
 const op=args[0];
 if(op==='s3api'){const key=args[args.indexOf('--key')+1];if(!fs.existsSync(path.join(dir,path.basename(key))))process.exit(9);write('remote-head');}
 else if(op==='s3'&&args[1]==='cp'){
   const src=args[2],dst=args[3],remote=x=>x.startsWith('s3://'),local=x=>path.join(dir,path.basename(x));
   if(remote(src)){fs.copyFileSync(local(src),dst);if(corrupt){const b=fs.readFileSync(dst);b[b.length-1]^=1;fs.writeFileSync(dst,b);}write('remote-download');}
   else if(remote(dst)){fs.copyFileSync(src,local(dst));write('remote-upload');}
   else process.exit(9);
 }else process.exit(9);
}else process.exit(9);
`;
function fixture(corrupt=false) {
 const dir=mkdtempSync(join(tmpdir(),'epmo-s34-flow-'));
 const bin=join(dir,'bin');mkdirSync(bin);
 const fakeCode=fake.replaceAll('__DIR__',JSON.stringify(dir))
   .replaceAll('__LOG__',JSON.stringify(join(dir,'calls.log')))
   .replaceAll('__CORRUPT__',JSON.stringify(corrupt));
 for(const name of ['docker','aws']){const p=join(bin,name);writeFileSync(p,fakeCode);chmodSync(p,0o700);}
 const key=join(dir,'key');writeFileSync(key,randomBytes(32));chmodSync(key,0o600);
 const env={PATH:bin+':'+process.env.PATH,
  DEPLOYMENT_ENV:'staging',EPMO_SYNTHETIC_ONLY:'YES',EPMO_REMOTE_IO_APPROVED:'YES',
  EPMO_RECOVERY_S3_PREFIX:'s3://epmo-test-bucket/epmo-synthetic-drills/staging',
  EPMO_RECOVERY_KEY_FILE:key,EPMO_PG_IMAGE:'postgres:16-alpine@sha256:'+'a'.repeat(64),
  AWS_ACCESS_KEY_ID:'SYNTHETIC_TEST_ONLY',AWS_SECRET_ACCESS_KEY:'SYNTHETIC_TEST_ONLY',
  AWS_REGION:'eu-central-1'};
 return {dir,env};
}
test('S34 executes synthetic remote roundtrip, injected failure and clean rollback with no container leak',async()=>{
 const {dir,env}=fixture();
 try{
  const r=await runSyntheticDrill(env,{socketCheck:()=>true});
  assert.equal(r.result,'synthetic-drill-only');
  const lines=readFileSync(env.FAKE_LOG,'utf8').trim().split('\n');
  assert.equal(lines.filter(x=>x.startsWith('run ')).length,3);
  assert.equal(lines.filter(x=>x.startsWith('restore ')).length,2);
  assert.equal(lines.filter(x=>x.startsWith('rm ')).length,3);
  assert.equal(lines.filter(x=>x.startsWith('mutate ')).length,1);
  assert.ok(lines.indexOf('remote-upload')<lines.indexOf('remote-download'));
  assert.ok(lines.indexOf('remote-download')<lines.findIndex(x=>x.startsWith('restore ')));
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('S34 corrupted off-host archive blocks restore and cleans disposable source',async()=>{
 const {dir,env}=fixture(true);
 try{
  await assert.rejects(runSyntheticDrill(env,{socketCheck:()=>true}));
  const lines=readFileSync(env.FAKE_LOG,'utf8').trim().split('\n');
  assert.equal(lines.filter(x=>x.startsWith('restore ')).length,0);
  assert.equal(lines.filter(x=>x.startsWith('rm ')).length,1);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
