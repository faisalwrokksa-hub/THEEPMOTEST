/** Ensure SQL migrations and Drizzle's journal are a complete ordered chain.
 * Runs without pnpm, secrets, PostgreSQL, or a network connection.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION_NAME = /^([0-9]{4})_[a-z0-9_]+$/;
const SQL_NAME = /^([0-9]{4})_[a-z0-9_]+\.sql$/;

export function checkMigrationChain(journal, sqlNames, sqlContents = {}) {
  const errors = [];
  if (!journal || journal.dialect !== 'postgresql' || !Array.isArray(journal.entries))
    return ['Migration journal missing or invalid'];
  const tags = new Set();
  const entries = journal.entries;
  let previousWhen = -Infinity;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry.tag !== 'string' || !MIGRATION_NAME.test(entry.tag)) {
      errors.push(`Entry ${i}: malformed migration tag`);
      continue;
    }
    if (entry.idx !== i || Number(entry.tag.slice(0, 4)) !== i)
      errors.push(`Entry ${i}: index or migration sequence mismatch`);
    if (tags.has(entry.tag)) errors.push(`Entry ${i}: duplicate migration tag`);
    tags.add(entry.tag);
    if (!Number.isSafeInteger(entry.when) || entry.when <= previousWhen)
      errors.push(`Entry ${i}: non-increasing migration timestamp`);
    previousWhen = entry.when;
    if (!sqlNames.includes(`${entry.tag}.sql`)) errors.push(`Entry ${i}: missing SQL file ${entry.tag}.sql`);
    if (Object.hasOwn(sqlContents, entry.tag) && !sqlContents[entry.tag].trim())
      errors.push(`Entry ${i}: empty SQL file ${entry.tag}.sql`);
  }
  for (const file of sqlNames) {
    if (!SQL_NAME.test(file)) errors.push(`Unrecognized SQL filename ${file}`);
    else if (!tags.has(file.slice(0, -4))) errors.push(`Unjournaled SQL migration ${file}`);
  }
  if (!entries.length) errors.push('No migrations registered');
  return errors;
}

/** Keep historical migration content immutable, not only its filename.
 * This pins source bytes in the release. It does not prove an already-upgraded
 * database used the same bytes; database-side attestation remains a staging task.
 */
export function checkMigrationHashes(manifest, fileHashes) {
  const errors = [];
  if (!manifest || manifest.schemaVersion !== 1 || manifest.algorithm !== 'sha256' ||
      !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    return ['Migration checksum manifest missing or invalid'];
  }
  const pinned = Object.keys(manifest.files);
  const actual = Object.keys(fileHashes);
  for (const file of actual) {
    if (!Object.hasOwn(manifest.files, file)) {
      errors.push(`Unpinned migration SQL file: ${file}`);
      continue;
    }
    const expected = manifest.files[file];
    if (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected) || expected !== fileHashes[file])
      errors.push(`Modified migration SQL file or invalid digest: ${file}`);
  }
  for (const file of pinned) {
    if (!actual.includes(file)) errors.push(`Missing pinned migration SQL file: ${file}`);
    if (!/^[0-9]{4}_[a-z0-9_]+\.sql$/.test(file)) errors.push(`Invalid pinned SQL filename: ${file}`);
  }
  return errors;
}

export function verifyRepositoryMigrations(migrationsDir = resolve(root, 'packages/db/migrations')) {
  const journal = JSON.parse(readFileSync(resolve(migrationsDir, 'meta/_journal.json'), 'utf8'));
  const files = readdirSync(migrationsDir).filter(name => name.endsWith('.sql')).sort();
  const contents = Object.fromEntries(files.map(file => [file.slice(0, -4), readFileSync(resolve(migrationsDir, file), 'utf8')]));
  const errors = checkMigrationChain(journal, files, contents);
  const manifest = JSON.parse(readFileSync(resolve(migrationsDir, 'meta/_sha256.json'), 'utf8'));
  const fileHashes = Object.fromEntries(files.map(file => [
    file, createHash('sha256').update(readFileSync(resolve(migrationsDir, file))).digest('hex'),
  ]));
  errors.push(...checkMigrationHashes(manifest, fileHashes));
  if (errors.length) throw new Error(`Migration release gate failed:\n${errors.join('\n')}`);
  return { count: files.length, latest: journal.entries.at(-1).tag, checksumsVerified: true };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyRepositoryMigrations();
    console.log(`PASS migration chain: ${result.count} ordered SQL migrations through ${result.latest}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
