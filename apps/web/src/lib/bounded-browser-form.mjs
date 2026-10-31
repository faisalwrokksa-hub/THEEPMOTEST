/**
 * Parse customer browser form submissions with a strict byte budget.
 *
 * Request.formData() consumes the entire untrusted request before validation.
 * A large multipart body can exhaust a Next.js worker before the authenticated
 * mutation reaches the API. Bound the stream first, then parse only the
 * complete body. Never forward a partial form or retry a mutation.
 */
export async function readBoundedBrowserForm(request, maxBytes = 131072) {
  const limit = Number.isSafeInteger(maxBytes) && maxBytes > 0
    ? Math.min(maxBytes, 262144) : 131072;
  const contentType = request?.headers?.get?.('content-type') ?? '';
  if (!/^multipart\/form-data\s*;\s*boundary=.+/i.test(contentType) &&
      !/^application\/x-www-form-urlencoded(?:\s*;|\s*$)/i.test(contentType)) {
    return { form: null, error: 'invalid' };
  }
  const length = request.headers.get('content-length');
  if (length !== null) {
    if (!/^\d+$/.test(length) || !Number.isSafeInteger(Number(length))) {
      return { form: null, error: 'invalid' };
    }
    if (Number(length) > limit) return { form: null, error: 'too-large' };
  }
  if (!request.body || typeof request.body.getReader !== 'function') {
    return { form: null, error: 'invalid' };
  }
  let reader;
  try { reader = request.body.getReader(); }
  catch { return { form: null, error: 'invalid' }; }
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
      if (!(value instanceof Uint8Array)) return { form: null, error: 'invalid' };
      if (value.byteLength > limit - total) {
        return { form: null, error: 'too-large' };
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
    // The content-type, including multipart boundary, comes from the original
    // request. No cookies, authorization or untrusted headers are replayed.
    const bounded = new Request(request.url, {
      method: 'POST', headers: { 'content-type': contentType }, body: bytes,
    });
    return { form: await bounded.formData(), error: null };
  } catch {
    return { form: null, error: 'invalid' };
  } finally {
    if (!complete) {
      try { await reader.cancel(); } catch { /* stream already terminated */ }
    }
    try { reader.releaseLock(); } catch { /* lock already released */ }
  }
}
