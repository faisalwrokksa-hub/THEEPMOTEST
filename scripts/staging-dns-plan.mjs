#!/usr/bin/env node
/** Offline review of proposed DNS A records. No network, DNS provider or host access. */
import { readFileSync } from 'node:fs';
import { isIP, BlockList } from 'node:net';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const names = ['staging.theepmo.com', 'api-staging.theepmo.com'];
const blocked = new BlockList();
for (const cidr of [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
  '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24',
  '192.0.2.0/24',
  // IANA special-purpose protocol/anycast blocks are not staging web hosts.
  // https://www.iana.org/assignments/iana-ipv4-special-registry
  '192.31.196.0/24', '192.52.193.0/24', '192.88.99.0/24',
  '192.168.0.0/16', '192.175.48.0/24', '198.18.0.0/15',
  '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/3',
]) {
  const [network, bits] = cidr.split('/');
  blocked.addSubnet(network, Number(bits), 'ipv4');
}
function publicIPv4(value) {
  return typeof value === 'string' && isIP(value) === 4 &&
    /^(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*)){3}$/.test(value) &&
    !blocked.check(value, 'ipv4');
}

export function validateStagingDnsPlan(plan) {
  const issues = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return ['Plan must be an object'];
  if (plan.environment !== 'staging' || plan.zone !== 'theepmo.com') issues.push('Expected staging environment and theepmo.com zone');
  if (!Array.isArray(plan.records) || plan.records.length !== 2) return [...issues, 'Exactly two staging records required'];
  const seen = new Set();
  for (const record of plan.records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) { issues.push('Invalid record object'); continue; }
    if (!names.includes(record.name) || seen.has(record.name)) issues.push('Unexpected or duplicate DNS hostname');
    seen.add(record.name);
    if (record.type !== 'A') issues.push('Only reviewed IPv4 A records allowed');
    if (!publicIPv4(record.value)) issues.push('DNS target must be a public non-special-use IPv4 address');
    if (!Number.isInteger(record.ttl) || record.ttl < 60 || record.ttl > 3600) issues.push('TTL must be 60–3600 seconds');
    if (Object.keys(record).sort().join(',') !== 'name,ttl,type,value') issues.push('Unexpected record fields');
  }
  if (seen.size !== 2) issues.push('Both staging hostnames required');
  if (Object.keys(plan).sort().join(',') !== 'environment,records,zone') issues.push('Unexpected plan fields');
  return issues;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 4 || process.argv[2] !== '--plan') {
    console.error('Usage: node scripts/staging-dns-plan.mjs --plan <reviewed-plan.json>');
    process.exitCode = 2;
  } else {
    try {
      const plan = JSON.parse(readFileSync(process.argv[3], 'utf8'));
      const issues = validateStagingDnsPlan(plan);
      for (const issue of issues) console.error('BLOCKED: ' + issue);
      if (issues.length) process.exitCode = 1;
      else console.log('PASS: offline DNS proposal shape only; no live DNS, TLS, ownership or residency verification performed');
    } catch {
      console.error('BLOCKED: unreadable or malformed DNS plan');
      process.exitCode = 1;
    }
  }
}
