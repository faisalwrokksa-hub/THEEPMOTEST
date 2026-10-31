/**
 * Document links can originate from a legacy stored URL or Microsoft Graph
 * metadata. Never place a non-HTTP(S), credential-bearing, protocol-relative
 * or control-character URL into a browser Location header.
 * Preserve the original signed URL bytes after validation.
 */
export function safeDocumentRedirectUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value || value.trim() !== value ||
      /[\\\u0000-\u001f\u007f]/.test(value) || value.startsWith('//')) {
    return null;
  }
  try {
    const url = new URL(value);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') ||
        !url.hostname || url.username || url.password) return null;
    return value;
  } catch {
    return null;
  }
}
