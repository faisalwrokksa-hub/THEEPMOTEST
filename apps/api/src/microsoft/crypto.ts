import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';

/**
 * Encryption for the one secret we hold on a customer's behalf.
 *
 * A Microsoft refresh token is long-lived and, for the scopes we ask for, is
 * read and write access to a customer's SharePoint. Storing it in a column in
 * the clear would make every database dump, every replica and every backup a
 * set of keys to their documents. So it is sealed before it is written and
 * only ever opened in memory, for the length of one token refresh.
 *
 * AES-256-GCM: authenticated, so a tampered ciphertext fails to open rather
 * than decrypting to something. The stored form is iv.tag.ciphertext, base64,
 * dot-separated, prefixed with a version so a future key rotation can tell
 * which scheme produced a given row.
 */

const VERSION = 'v1';

/**
 * The key comes from MS_TOKEN_KEY: 32 bytes as base64 or hex, or any passphrase
 * of real length, which is hashed to 32 bytes.
 *
 * Read on every call rather than at import, so a process started without it can
 * still serve every other route — only the Microsoft ones refuse, and they say
 * why. Binding this at import time would turn a missing optional setting into
 * an API that will not boot.
 */
function key(): Buffer {
  const raw = process.env.MS_TOKEN_KEY ?? '';
  if (!raw) {
    throw new Error(
      'MS_TOKEN_KEY is not set, so a Microsoft refresh token cannot be stored safely. ' +
      'Generate one with:  openssl rand -base64 32');
  }
  for (const enc of ['base64', 'hex'] as const) {
    try {
      const b = Buffer.from(raw, enc);
      // A base64 decode never fails loudly, so check it round-trips and is the
      // right length before trusting it as raw key material.
      if (b.length === 32 && b.toString(enc).replace(/=+$/, '') === raw.replace(/=+$/, '')) return b;
    } catch { /* try the next encoding */ }
  }
  if (raw.length < 16) {
    throw new Error('MS_TOKEN_KEY is too short. Use 32 random bytes:  openssl rand -base64 32');
  }
  return createHash('sha256').update(raw).digest();
}

/** True when tokens can be stored at all — the connect flow checks this first. */
export function canSealTokens(): boolean {
  try { key(); return true; } catch { return false; }
}

export function seal(plaintext: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([c.update(plaintext, 'utf8'), c.final()]);
  return [VERSION, iv.toString('base64'), c.getAuthTag().toString('base64'),
          body.toString('base64')].join('.');
}

export function open(sealed: string): string {
  const [version, iv, tag, body] = sealed.split('.');
  if (version !== VERSION || !iv || !tag || !body) {
    throw new Error('That stored token is not in a form this version can read.');
  }
  const d = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  d.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([d.update(Buffer.from(body, 'base64')), d.final()]).toString('utf8');
}
