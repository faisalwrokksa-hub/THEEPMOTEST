#!/usr/bin/env node
/** Q45: fail closed unless the checkout matches the immutable PR head / push SHA. */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export function candidateShaFromEnvironment(env) {
  if (typeof env.EPMO_CANDIDATE_SHA !== 'string' || !env.EPMO_CANDIDATE_SHA)
    throw new Error('Missing trusted CI candidate SHA');
  return env.EPMO_CANDIDATE_SHA;
}
export function assertCandidateSha(expected, actual) {
  if (typeof expected !== 'string' || !/^[a-f0-9]{40}$/i.test(expected) ||
      typeof actual !== 'string' || !/^[a-f0-9]{40}$/i.test(actual))
    throw new Error('Invalid CI candidate or checkout SHA');
  if (expected.toLowerCase() !== actual.toLowerCase())
    throw new Error('BLOCKED: checked-out commit differs from immutable candidate SHA');
  return expected.toLowerCase();
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.env.CI !== 'true' || process.env.GITHUB_ACTIONS !== 'true')
      throw new Error('Exact-head attestation requires GitHub CI');
    const actual = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', timeout: 5000 }).trim();
    const sha = assertCandidateSha(candidateShaFromEnvironment(process.env), actual);
    console.log('PASS: checked-out candidate head ' + sha);
  } catch (error) {
    console.error('BLOCKED exact-head CI: ' + error.message);
    process.exitCode = 1;
  }
}
