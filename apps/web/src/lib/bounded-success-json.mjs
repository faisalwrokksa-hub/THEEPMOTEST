/** Read an authenticated success response with a hard decoded-byte ceiling.
 * The API is trusted to authorize tenants, not to supply unbounded JSON to a
 * Next.js renderer. Reject the entire response on overflow or parse failure.
 */
export async function readBoundedSuccessJson(response, maxBytes = 16 * 1024 * 1024) {
  const ceiling = 16 * 1024 * 1024;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > ceiling) {
    throw new Error('Invalid API response limit');
  }
  const declared = response?.headers?.get?.('content-length');
  if (typeof declared === 'string' && /^[0-9]+$/.test(declared) && Number(declared) > maxBytes) {
    throw new Error('API response too large');
  }
  if (!response?.body || typeof response.body.getReader !== 'function') {
    throw new Error('Missing API response body');
  }
  const reader = response.body.getReader();
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
      if (!(value instanceof Uint8Array) || value.byteLength > maxBytes - total) {
        throw new Error('API response too large or invalid');
      }
      chunks.push(value);
      total += value.byteLength;
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } finally {
    if (!complete) {
      try { await reader.cancel(); } catch { /* already closed */ }
    }
    try { reader.releaseLock(); } catch { /* already released */ }
  }
}
