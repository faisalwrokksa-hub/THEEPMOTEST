/**
 * Microsoft token and Graph/Power BI endpoints are outside our trust boundary.
 * A successful upstream response is not permission to buffer unlimited bytes.
 * Check the declared length and enforce the same limit while streaming, since
 * chunked responses can omit Content-Length or advertise a false value.
 */
export const MAX_MICROSOFT_TOKEN_RESPONSE_BYTES = 64 * 1024;
export const MAX_MICROSOFT_API_RESPONSE_BYTES = 8 * 1024 * 1024;

export async function readBoundedMicrosoftJson(response: Response, limit: number): Promise<unknown> {
  if (!Number.isSafeInteger(limit) || limit <= 0) throw new Error('Invalid Microsoft response limit');
  const declared = response.headers.get('content-length');
  if (declared !== null && (!/^\d+$/.test(declared) || !Number.isSafeInteger(Number(declared)) || Number(declared) > limit)) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error('Microsoft response exceeds the permitted size');
  }
  if (!response.body) return undefined;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Microsoft response exceeds the permitted size');
      chunks.push(value);
    }
  } finally {
    // Cancel an oversized or aborted stream; a completed stream is already closed.
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
  if (size === 0) return undefined;
  try {
    return JSON.parse(Buffer.concat(chunks.map(chunk => Buffer.from(chunk)), size).toString('utf8')) as unknown;
  } catch {
    // Do not echo upstream bodies: OAuth failures may contain sensitive values.
    throw new Error('Microsoft returned malformed JSON');
  }
}
