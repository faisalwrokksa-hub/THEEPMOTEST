/** Keep untrusted pagination parameters from causing invalid Date errors in the API. */
export function validProjectCursor(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 40) return undefined;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value ? value : undefined;
}

/** Preserve the authorized project view while moving between API cursor pages. */
export function projectPageHref(cursor: string | null, program?: string, health?: string): string {
  const params = new URLSearchParams();
  if (program) params.set('program', program);
  if (health) params.set('health', health);
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return query ? `/projects?${query}` : '/projects';
}
