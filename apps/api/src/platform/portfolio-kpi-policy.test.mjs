import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePortfolioThresholds,evaluatePortfolioThresholds} from './portfolio-kpi-policy.mjs';
test('safe KPI override leaves defaults intact',()=>{const p=validatePortfolioThresholds({highRiskCount:5});assert.equal(p.highRiskCount,5);assert.equal(p.criticalRiskCount,1)});
test('unknown governance bypass fails closed',()=>assert.throws(()=>validatePortfolioThresholds({skipApprovals:true})));
test('invalid threshold fails closed',()=>assert.throws(()=>validatePortfolioThresholds({criticalRiskCount:0})));
test('deterministic KPI calculation',()=>assert.equal(evaluatePortfolioThresholds({criticalRiskCount:2},{criticalRiskCount:2}).criticalRisk,true));
