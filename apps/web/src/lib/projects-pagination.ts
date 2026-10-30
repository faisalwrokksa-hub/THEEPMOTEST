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

/** Ignore invalid URL health values instead of silently hiding every project. */
export function validProjectHealth(value: unknown): string | undefined {
  return value === 'on_track' || value === 'at_risk' || value === 'critical'
    ? value : undefined;
}

/** A programme project row must open that project's governance record. */
export function projectGovernanceHref(projectId: string): string {
  return `/governance/${encodeURIComponent(projectId)}`;
}

/** Page-scoped only: the API must own any future portfolio-wide health filter. */
export function filterProjectPage<T extends { health: string }>(items: readonly T[], health?: string): T[] {
  return health ? items.filter(item => item.health === health) : [...items];
}
