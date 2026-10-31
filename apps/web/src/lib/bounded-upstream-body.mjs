/**
 * Consume at most a fixed number of upstream error-body bytes.
 *
 * API error payloads are untrusted, even when the request itself was
 * authenticated. Reading the whole response with text() or json() before
 * sanitizing it lets an oversized error exhaust the Next.js process.
 * Oversized, malformed and unreadable bodies are discarded, never surfaced.
 */
export async function readBoundedUpstreamText(response, maxBytes = 4096) {
  const limit = Number.isSafeInteger(maxBytes) && maxBytes > 0
    ? Math.min(maxBytes, 65536) : 4096;
  if (!response?.body || typeof response.body.getReader !== 'function') return '';
  let reader;
  try { reader = response.body.getReader(); } catch { return ''; }
  const chunks = [];
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        complete = true;
        break;
      }
      if (!(value instanceof Uint8Array) || total + value.byteLength > limit) return '';
      chunks.push(value);
      total += value.byteLength;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return '';
  } finally {
    if (!complete) {
      try { await reader.cancel(); } catch { /* upstream stream already failed */ }
    }
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}

/** Parse only complete, size-bounded validation JSON; never parse partial data. */
export async function readBoundedUpstreamJson(response, maxBytes = 16384) {
  const text = await readBoundedUpstreamText(response, maxBytes);
  if (!text) return null;
  try { return JSON.parse(text); } catch { return null; }
}
