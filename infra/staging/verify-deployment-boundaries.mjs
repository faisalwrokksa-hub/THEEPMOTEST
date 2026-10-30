#!/usr/bin/env node
/** Offline verification of non-secret sample inventory; no hosting access. */
import { readFileSync } from 'node:fs';
import { verifyDeploymentIsolationMatrix } from './deployment-boundaries.mjs';
const file = new URL('./deployment-matrix.example.json', import.meta.url);
try {
  const inventory = JSON.parse(readFileSync(file, 'utf8'));
  const checks = verifyDeploymentIsolationMatrix(inventory.deployments, inventory.approvedRegions);
  for (const check of checks) console.log((check.passed ? 'PASS ' : 'BLOCKED ') + check.name);
  if (checks.some(c=>!c.passed)) process.exitCode=1;
  console.log('Inventory-only verification: NOT evidence of physical or operational isolation.');
} catch {
  console.error('BLOCKED: invalid staging deployment inventory.');
  process.exitCode=1;
}
