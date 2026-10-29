import test from 'node:test';
import assert from 'node:assert/strict';
import {portfolioSignals} from './portfolio-intelligence.ts';
const point=(n,critical=0)=>({onDate:`2026-10-${String(n).padStart(2,'0')}`,projects:5,onTrack:4,atRisk:1,critical,avgProgress:n,gatesBlocked:0,openRegister:2});
test('missing history never fabricates forecasts',()=>{const r=portfolioSignals([]);assert.equal(r.confidence,'insufficient');assert.ok(r.signals.every(s=>s.change===null&&s.direction==='unavailable'));});
test('six days do not justify a trend',()=>assert.equal(portfolioSignals(Array.from({length:6},(_,i)=>point(i+1))).confidence,'insufficient'));
test('seven distinct days give explainable historical direction',()=>{const r=portfolioSignals(Array.from({length:7},(_,i)=>point(i+1,i)));assert.equal(r.signals[0].direction,'deteriorating');assert.equal(r.signals[2].direction,'improving');assert.match(r.signals[0].explanation,/not a future forecast/);});
test('unsorted duplicate dates are deduplicated',()=>{const r=portfolioSignals([...Array.from({length:7},(_,i)=>point(7-i)),point(1)]);assert.equal(r.sampleDays,7);});
test('malformed values are ignored and no financial or identity fields leak',()=>{const r=portfolioSignals([...Array.from({length:7},(_,i)=>({...point(i+1),secret:'key',budget:100000})),{onDate:'bogus',critical:-1}]);assert.doesNotMatch(JSON.stringify(r),/"secret":"key"|100000/);});
