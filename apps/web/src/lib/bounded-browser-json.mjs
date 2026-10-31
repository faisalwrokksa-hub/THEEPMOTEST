/**
 * Parse only complete, small browser JSON bodies before any public auth write.
 * Password reset and invitation tokens must never be forwarded from oversized
 * or truncated requests. No cookies or request headers are replayed.
 */
export async function readBoundedBrowserJson(request, maxBytes = 16384) {
  const limit = Number.isSafeInteger(maxBytes) && maxBytes > 0
    ? Math.min(maxBytes, 65536) : 16384;
  const contentType = request?.headers?.get?.('content-type') ?? '';
  if (!/^application\/json(?:\s*;.*)?$/i.test(contentType)) {
    return { value: null, error: 'invalid' };
  }
  const length = request.headers.get('content-length');
  if (length !== null) {
    if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))) {
      return { value: null, error: 'invalid' };
    }
    if (Number(length) > limit) return { value: null, error: 'too-large' };
  }
  if (!request.body || typeof request.body.getReader !== 'function') {
    return { value: null, error: 'invalid' };
  }
  let reader;
  try { reader = request.body.getReader(); }
  catch { return { value: null, error: 'invalid' }; }
  const chunks = [];
  let total = 0;
  let complete = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) { complete = true; break; }
      if (!(value instanceof Uint8Array)) return { value: null, error: 'invalid' };
      if (value.byteLength > limit - total) return { value: null, error: 'too-large' };
      chunks.push(value);
      total += value.byteLength;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { value: null, error: 'invalid' };
    }
    return { value, error: null };
  } catch {
    return { value: null, error: 'invalid' };
  } finally {
    if (!complete) {
      try { await reader.cancel(); } catch { /* already closed */ }
    }
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
