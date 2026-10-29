import test from 'node:test';
import assert from 'node:assert/strict';
import { makeInvitationToken, parseInvitationToken, isInvitationAcceptable, invitationLink } from './invitation-policy.ts';
const tenant='8e6d7ac0-970f-400a-a08e-8820b89ab7d2';
test('invitation token contains unpredictable random secret and only a hash is persisted',()=>{
 const a=makeInvitationToken(tenant), b=makeInvitationToken(tenant);
 assert.notEqual(a.token,b.token);assert.equal(a.hash.length,64);
 assert.equal(parseInvitationToken(a.token)?.hash,a.hash);
 assert.ok(!a.token.includes(a.hash));
});
test('malformed, short, and oversize tokens fail closed',()=>{
 for(const candidate of ['',null,'x.y',`${tenant}.short`,`${tenant}.`+'a'.repeat(500), `${tenant}.`+'+'.repeat(43), `${tenant}.`+'A'.repeat(43)+'.x'])
  assert.equal(parseInvitationToken(candidate),null);
});
test('fresh delivered invitation is acceptable',()=>assert.equal(isInvitationAcceptable({deliveryStatus:'sent',expiresAt:'2030-01-01'},new Date('2029-12-01')),true));
test('expires exactly at its deadline',()=>assert.equal(isInvitationAcceptable({deliveryStatus:'sent',expiresAt:'2030-01-01'},new Date('2030-01-01')),false));
test('replay after consumption is refused',()=>assert.equal(isInvitationAcceptable({deliveryStatus:'sent',expiresAt:'2030-01-01',consumedAt:'2029-12-01'},new Date('2029-12-02')),false));
test('revoked invitation is refused',()=>assert.equal(isInvitationAcceptable({deliveryStatus:'sent',expiresAt:'2030-01-01',revokedAt:'2029-12-01'},new Date('2029-12-02')),false));
test('undelivered invitation is refused',()=>assert.equal(isInvitationAcceptable({deliveryStatus:'pending',expiresAt:'2030-01-01'},new Date('2029-12-02')),false));
test('invalid expiry is refused',()=>assert.equal(isInvitationAcceptable({deliveryStatus:'sent',expiresAt:'garbage'}),false));
test('fragment token is not sent as URL query or path',()=>{
 const link=invitationLink('https://theepmo.com',makeInvitationToken(tenant).token);
 const url=new URL(link);assert.equal(url.pathname,'/accept-invite');assert.equal(url.search,'');assert.ok(url.hash.startsWith('#token='));
});
test('unsafe nonlocal HTTP invitation links are refused',()=>assert.throws(()=>invitationLink('http://example.com',makeInvitationToken(tenant).token)));
