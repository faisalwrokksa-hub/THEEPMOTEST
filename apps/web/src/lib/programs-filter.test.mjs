import test from 'node:test';
import assert from 'node:assert/strict';
import {selectedPortfolioId,programsForPortfolio} from './programs-filter.ts';
const one='11111111-1111-4111-8111-111111111111';
const two='22222222-2222-4222-8222-222222222222';
const portfolio=[{id:one}];
const programs=[{id:'a',portfolioId:one},{id:'b',portfolioId:two}];
test('explicit visible portfolio selection filters programmes',()=>{
  assert.equal(selectedPortfolioId(one,portfolio),one);
  assert.deepEqual(programsForPortfolio(programs,one).map(p=>p.id),['a']);
});
test('unknown or invalid selection never widens results',()=>{
  for(const input of [two,'not-a-uuid',null,[],['spoofed']]){
    const chosen=selectedPortfolioId(input,portfolio);
    assert.equal(chosen,null);
    assert.deepEqual(programsForPortfolio(programs,chosen),[]);
  }
});
test('no requested portfolio keeps the authorized programme listing',()=>{
  assert.equal(selectedPortfolioId(undefined,portfolio),undefined);
  assert.equal(programsForPortfolio(programs,undefined).length,2);
});
