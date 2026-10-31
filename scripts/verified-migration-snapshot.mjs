/** Verify the exact frozen SQL bytes the runner will execute, not a prior read.
 * An attacker or broken deployment process must not swap migration SQL between
 * the initial manifest check, SHA-256 calculation and psql execution.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NAME = /^[0-9]{4}_[a-z0-9_]+\.sql$/;
const SHA256 = /^[a-f0-9]{64}$/;

export function verifyMigrationSnapshot(filename, bytes, manifest) {
  if (typeof filename !== 'string' || !NAME.test(filename) ||
      !manifest || manifest.schemaVersion !== 1 || manifest.algorithm !== 'sha256' ||
      !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files)) {
    throw new Error('Invalid SQL migration snapshot inventory');
  }
  const expected = manifest.files[filename];
  if (typeof expected !== 'string' || !SHA256.test(expected))
    throw new Error(`Missing pinned SQL migration checksum: ${filename}`);
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected)
    throw new Error(`SQL snapshot bytes differ from release checksum: ${filename}`);
  return actual;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [, , filename, snapshotPath] = process.argv;
    if (!filename || !snapshotPath) throw new Error('Migration filename and snapshot are required');
    const manifest = JSON.parse(readFileSync(resolve(root, 'packages/db/migrations/meta/_sha256.json'), 'utf8'));
    const digest = verifyMigrationSnapshot(filename, readFileSync(snapshotPath), manifest);
    process.stdout.write(digest);
  } catch (error) {
    console.error(`BLOCKED: SQL migration snapshot verification failed: ${error.message}`);
    process.exitCode = 1;
  }
}
