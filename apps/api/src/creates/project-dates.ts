/** Validate optional project dates before writing a project. Pure and reusable. */
export function projectDateError(start?: string | Date | null, end?: string | Date | null): string | null {
  function isDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }
  const normalizedStart = start instanceof Date ? (Number.isFinite(start.getTime()) ? start.toISOString().slice(0, 10) : '') : start;
  const normalizedEnd = end instanceof Date ? (Number.isFinite(end.getTime()) ? end.toISOString().slice(0, 10) : '') : end;
  if (start && !normalizedStart) return 'Start date must be a valid YYYY-MM-DD date';
  if (end && !normalizedEnd) return 'Target finish must be a valid YYYY-MM-DD date';
  if (normalizedStart && !isDate(normalizedStart)) return 'Start date must be a valid YYYY-MM-DD date';
  if (normalizedEnd && !isDate(normalizedEnd)) return 'Target finish must be a valid YYYY-MM-DD date';
  if (normalizedStart && normalizedEnd && normalizedEnd < normalizedStart) return 'Target finish must not be earlier than start date';
  return null;
}
