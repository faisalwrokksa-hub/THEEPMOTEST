#!/usr/bin/env node
/** Fail-closed, offline review of a CI-produced dependency promotion artifact.
 * Does not install, audit, push, merge, or deploy. Applying requires a clean,
 * non-default Git branch; rerun CI on the resulting exact commit.
 */
import { readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const files = [
  'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'package.json',
  'apps/api/package.json', 'apps/web/package.json',
  'packages/contracts/package.json', 'packages/db/package.json',
];
function fail(message) { throw new Error(message); }
function run(command, args, options = {}) {
  return execFileSync(command, args, { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, ...options });
}
function assert(condition, message) { if (!condition) fail(message); }
function parseArgs(argv) {
  const [archive, expected, flag, destination, ...extra] = argv;
  assert(archive && /^[a-f0-9]{64}$/i.test(expected ?? ''),
    'Usage: node scripts/prepare-dependency-promotion.mjs candidate.zip <sha256> [--apply <repo-directory>]');
  assert(!extra.length && ((!flag && !destination) || (flag === '--apply' && destination)), 'Invalid options');
  return { archive: resolve(archive), expected: expected.toLowerCase(), destination: destination && resolve(destination) };
}
function inspect(archive, expected) {
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex');
  assert(digest === expected, `Artifact SHA-256 mismatch: expected ${expected}, got ${digest}`);
  run('unzip', ['-tqq', archive]);
  const entries = run('unzip', ['-Z1', archive]).trim().split(/\r?\n/).sort();
  assert(JSON.stringify(entries) === JSON.stringify([...files].sort()),
    `Unexpected archive entries: ${JSON.stringify(entries)}`);
  const contents = new Map(files.map(path => [path, run('unzip', ['-p', archive, path]) ]));
  const root = JSON.parse(contents.get('package.json'));
  assert(root.packageManager === 'pnpm@10.17.0', 'Unexpected pnpm version');
  assert(root.devDependencies?.vite === '8.3.3', 'Candidate must pin patched root Vite 8.3.3');
  for (const path of files.filter(p => p.endsWith('/package.json'))) {
    const manifest = JSON.parse(contents.get(path));
    assert(manifest.devDependencies?.typescript === '~5.9.3', `TypeScript range inconsistent: ${path}`);
  }
  const workspace = contents.get('pnpm-workspace.yaml');
  const lockfile = contents.get('pnpm-lock.yaml');
  assert(/^overrides:\s*$/m.test(workspace) && /^\s+vite:\s*['"]?8\.3\.3['"]?\s*$/m.test(workspace)
    && /^\s+typescript:\s*['"]?~5\.9\.3['"]?\s*$/m.test(workspace), 'Workspace overrides missing');
  assert(/^lockfileVersion:\s*['"]?9\.0['"]?/m.test(lockfile), 'Unexpected lockfile format');
  assert(/^overrides:\s*\n(?:[^\n]*\n)*?\s+vite:\s*8\.3\.3\s*$/m.test(lockfile), 'Lockfile Vite override missing');
  assert(/^\s+vite:\s*\n\s+specifier:\s*8\.3\.3\s*\n\s+version:\s*8\.3\.3/m.test(lockfile), 'Lockfile root Vite importer mismatch');
  for (const importer of ['apps/api', 'apps/web', 'packages/contracts', 'packages/db']) {
    assert(lockfile.includes(`  ${importer}:`), `Missing lockfile importer: ${importer}`);
  }
  return { sha256: digest, files: files.length, vite: '8.3.3', typescript: '~5.9.3', validated: true,
    audit: 'NOT RUN by this tool', integration: 'NOT RUN by this tool' };
}
function apply(contents, destination) {
  assert(existsSync(join(destination, '.git')), 'Destination must be a Git checkout');
  const top = run('git', ['rev-parse', '--show-toplevel'], { cwd: destination }).trim();
  assert(resolve(top) === destination, 'Destination must be Git checkout root');
  const branch = run('git', ['branch', '--show-current'], { cwd: destination }).trim();
  assert(branch && !['main', 'master'].includes(branch), 'Refusing default or detached branch');
  assert(!run('git', ['status', '--porcelain'], { cwd: destination }).trim(), 'Working tree is not clean');
  for (const path of files) {
    const target = join(destination, path);
    assert(existsSync(target) && lstatSync(target).isFile(), `Missing or unsafe target: ${path}`);
  }
  for (const path of files) writeFileSync(join(destination, path), contents.get(path));
  return branch;
}
try {
  const { archive, expected, destination } = parseArgs(process.argv.slice(2));
  const receipt = inspect(archive, expected);
  if (destination) {
    const contents = new Map(files.map(path => [path, run('unzip', ['-p', archive, path]) ]));
    receipt.appliedToReviewBranch = apply(contents, destination);
  }
  console.log(JSON.stringify(receipt, null, 2));
} catch (error) {
  console.error(`Dependency candidate rejected: ${error.message}`);
  process.exitCode = 1;
}
