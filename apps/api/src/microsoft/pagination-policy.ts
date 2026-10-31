/**
 * Fail closed on malformed or non-terminating Microsoft pagination.
 * Graph and Power BI page shapes must contain an array of results.
 */
export const MAX_MICROSOFT_PAGES = 100;

export function microsoftPageItems<T>(
  page: unknown, remaining: number,
): { items: T[]; next: string | undefined } {
  if (!page || typeof page !== 'object' || !Array.isArray((page as { value?: unknown }).value)) {
    throw new Error('Invalid Microsoft paginated response.');
  }
  const next = (page as { '@odata.nextLink'?: unknown })['@odata.nextLink'];
  if (next !== undefined && (typeof next !== 'string' || !next.trim())) {
    throw new Error('Invalid Microsoft pagination continuation.');
  }
  const value = (page as { value: T[] }).value;
  return { items: value.slice(0, Math.max(0, remaining)), next: next as string | undefined };
}

export function assertMicrosoftPageVisit(url: string, visited: Set<string>, pageCount: number): void {
  if (pageCount >= MAX_MICROSOFT_PAGES) {
    throw new Error('Microsoft pagination exceeded the maximum page count.');
  }
  if (visited.has(url)) {
    throw new Error('Microsoft pagination repeated a page.');
  }
  visited.add(url);
}
