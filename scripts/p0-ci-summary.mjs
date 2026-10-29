#!/usr/bin/env node
/** Informational CI summary only. Never authorizes commercial launch. */
import { appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CI_GATES, LAUNCH_GATES, verifyReceipts } from './phase15e-release-evidence.mjs';

export function formatP0Summary(ci, launch) {
  const rows = [
    '## The EPMO — P0 evidence status',
    '',
    `- CI checks: **${ci.checks.filter(x => x.passed).length}/${CI_GATES.length}**`,
    `- Launch evidence: **${launch.checks.filter(x => x.passed).length}/${LAUNCH_GATES.length}**`,
    `- Commercial approval: **${launch.passed ? 'EVIDENCE COMPLETE — independent review still required' : 'NO-GO — missing live acceptance evidence'}**`,
    '', '| Gate | Evidence |', '|---|---|',
    ...launch.checks.map(x => `| ${x.gate} | ${x.passed ? 'PASS (same-run receipt)' : `BLOCKED (${x.reason})`} |`),
    '', 'A receipt attests that its recording step ran, not that an external provider or an independent auditor has certified readiness.',
  ];
  return rows.join('\n') + '\n';
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(new URL(import.meta.url).pathname)) {
  const dir = process.env.EPMO_EVIDENCE_DIR;
  const sha = process.env.GITHUB_SHA;
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
