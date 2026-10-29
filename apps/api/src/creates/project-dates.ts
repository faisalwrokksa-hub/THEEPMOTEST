/** Validate optional project dates before writing a project. Pure and reusable. */
export function projectDateError(start?: string | null, end?: string | null): string | null {
  function isDate(value: string): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
  }
  if (start && !isDate(start)) return 'Start date must be a valid YYYY-MM-DD date';
  if (end && !isDate(end)) return 'Target finish must be a valid YYYY-MM-DD date';
  if (start && end && end < start) return 'Target finish must not be earlier than start date';
  return null;
}
