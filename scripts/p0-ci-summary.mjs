/** Informational CI summary only. Never authorizes commercial launch. */
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CI_GATES, LAUNCH_GATES, verifyReceipts } from './phase15e-release-evidence.mjs';

const EXTERNAL_GATES = LAUNCH_GATES.filter(gate => !CI_GATES.includes(gate));

/** CI can attest its own steps, but cannot verify a provider or a human signoff.
 * Even a forged or accidentally misclassified launch.passed must not promote
 * a source-only workflow to production acceptance. */
export function formatP0Summary(ci, launch) {
  const ciChecks = CI_GATES.map(gate => {
    const matches = ci?.checks?.filter(check => check.gate === gate) ?? [];
    const receipt = matches.length === 1 ? matches[0] : null;
    return { gate, passed: receipt?.passed === true, reason: receipt?.reason ?? 'receipt missing or ambiguous' };
  });
  const rows = [
    '## The EPMO — P0 evidence status',
    '',
    `- Same-run CI step receipts: **${ciChecks.filter(x => x.passed).length}/${CI_GATES.length}** (not overall workflow status)`,
    `- Independent live acceptance: **0/${EXTERNAL_GATES.length} verified by CI** (requires separate external evidence)`,
    '- Nine commercial release gates: **NOT ASSESSED by CI** (see independent release ledger)',
    '- Commercial approval: **NO-GO — CI cannot authorize production release**',
    '', '| Gate | Evidence |', '|---|---|',
    ...ciChecks.map(x => `| ${x.gate} | ${x.passed ? 'CI STEP RECEIPT (same run)' : `BLOCKED (${x.reason})`} |`),
    ...EXTERNAL_GATES.map(gate => `| ${gate} | NOT VERIFIED (independent external acceptance required) |`),
    '',
    'CI receipts only attest that individual recording steps ran. They are not proof of provider payments, staging isolation, browser acceptance, recovery, nine-gate commercial approval or an overall successful workflow.',
  ];
  return rows.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const dir = process.env.EPMO_EVIDENCE_DIR;
  const sha = process.env.EPMO_CANDIDATE_SHA;
  const runId = process.env.GITHUB_RUN_ID;
  let content;
  try {
    if (!dir) throw new Error('Evidence directory unavailable');
    const context = { sha, runId };
    content = formatP0Summary(verifyReceipts(dir, 'ci', context), verifyReceipts(dir, 'launch', context));
  } catch(e) {
    content = `## The EPMO — P0 evidence status\n\n**NO-GO — evidence unavailable:** ${String(e.message).replace(/[\r\n|]/g,' ')}\n`;
  }
  console.log(content);
  if(process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, content);
}
