import { randomUUID } from 'node:crypto';

/** A tracing ID is untrusted input. Never reflect control characters or huge values. */
export function safeRequestId(value: unknown): string {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{7,63}$/.test(value)
    ? value
    : randomUUID();
}

/** Only framework route templates may enter logs; never a full URL or route parameter. */
export function safeRouteLabel(route: unknown): string {
  const path = typeof route === 'object' && route !== null && 'path' in route
    ? (route as { path: unknown }).path
    : undefined;
  return typeof path === 'string' && path.length <= 160 && /^\/[A-Za-z0-9_/:.*-]*$/.test(path)
    ? path
    : '[unmatched]';
}

/** Do not record upstream messages or stacks: they can contain URLs, tokens, or PII. */
export function safeErrorKind(error: unknown): string {
  const kind = error instanceof Error ? error.name : '';
  return ['Error', 'TypeError', 'RangeError', 'SyntaxError', 'ReferenceError'].includes(kind)
    ? kind
    : 'InternalError';
}
